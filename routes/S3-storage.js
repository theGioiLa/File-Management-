const AWS = require('aws-sdk'),
    express = require('express'),
    multiparty = require('multiparty'),
    config = require('../config'),
    router = express.Router(),
    authen = require('../middleware/authen'),
    S3Uploader = require('./S3-utils'),
    normalizeSize = require('../normalize').normalizeSize,
    debug = require('debug');

const log = debug('S3:log')
log.log = console.info.bind(console)
const error = debug('S3:error')

router.use(authen.authenticate);

let s3Client = new AWS.S3({
    endpoint: config.S3.endpoint,
    accessKeyId: config.S3.accessKeyId,
    secretAccessKey: config.S3.secretAccessKey,
    sslEnabled: false,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    s3DisableBodySigning: true,
});

const BUCKET_NAME = config.S3.bucket,
    PART_SIZE = config.S3.part_size

let s3Uploader = new S3Uploader(s3Client);

router.get('/', function (req, res) {
    let user = req.user;
    let options = {
        Bucket: BUCKET_NAME,
    };

    // s3Uploader.abortAllMultipartUpload(BUCKET_NAME);

    s3Client.listObjects(options, function (err, data) {
        if (err) {
            error(err);
            res.status(err.statusCode).end(err.message);
        }
        else {
            let body = [];
            let headReqs = [];
            data.Contents.forEach(function (_file) {
                headReqs.push(
                    s3Client.headObject({
                        Bucket: BUCKET_NAME,
                        Key: _file.Key
                    })
                        .promise()
                        .then(function (metadata) {
                            let file = Object.assign({}, _file, { contentType: metadata.Metadata['content-type'] });
                            body.push(file);
                        })
                        .catch(function (err) {
                            error(err);
                            res.status(err.statusCode).end(err.message);
                        })
                );
            });

            Promise.all(headReqs).then(function () {
                res.render('S3/index', {
                    title: 'S3 Upload',
                    username: user.username,
                    data: body,
                    prettySize: normalizeSize
                });
            });
        }
    });
});

router.post('/download/', function (req, res) {
    let key = req.body.Key;

    let getObjParams = {
        Bucket: BUCKET_NAME,
        Key: key
    };

    log(getObjParams);

    s3Client.getObject(getObjParams).createReadStream().pipe(res);
    res.on('close', function () {
        res.status(200).end();
    })
});

router.post('/upload', function (req, res) {
    let form = new multiparty.Form();

    form.on('part', function (part) {
        if (part.filename) {
            s3Uploader.upload(part, BUCKET_NAME);
        }
    });

    form.on('close', function () {
        res.redirect('/S3');
    });

    form.on('error', function (err) {
        error('Multiparty form error: ', err.message);
    });

    form.parse(req);
});

router.post('/upload/buffer', function (req, res) {
    let form = new multiparty.Form();

    form.on('part', function (part) {
        if (part.filename) {
            let receivedBuffers = [];
            let receivedBuffersLength = 0;

            part.on('data', function (chunk) {
                receivedBuffers.push(chunk);
                receivedBuffersLength += chunk.length;
            });

            part.on('end', function () {
                let buffer = Buffer.concat(receivedBuffers, receivedBuffersLength);
                s3Uploader.uploadByBuffer(buffer, BUCKET_NAME, part.filename, PART_SIZE, part.headers['content-type']);
            });

            part.on('error', function (err) {
                error('Part Error:', err.message);
            });
        }
    });

    form.on('close', function () {
        res.redirect('/S3');
    });

    form.on('error', function (err) {
        error('Form Error:', err.message);
    });

    form.parse(req);
});

router.post('/upload/stream', function (req, res) {
    let form = new multiparty.Form();

    form.on('part', function (part) {
        if (part.filename) {
            s3Uploader.uploadByStream(part, BUCKET_NAME, PART_SIZE);;
        }
    });

    form.on('error', function (err) {
        error('Form Error:', err.message);
    });

    form.on('close', function () {
        // res.redirect('/S3');
    });

    s3Uploader.on('error', function (err) {
        error('Upload Error: ', err.message)
    })

    s3Uploader.on('done', function (data) {
        res.redirect('/S3')
    })

    form.parse(req);
});

router.post('/delete', function (req, res) {
    let key = req.body.Key;

    let deleteParams = {
        Bucket: BUCKET_NAME,
        Key: key
    };

    s3Client.deleteObject(deleteParams, function (err, data) {
        if (err) error('Delete Error: ', err.message);
        else {
            res.status(200).send('Delete Ok');
        }
    });
});

module.exports = router;