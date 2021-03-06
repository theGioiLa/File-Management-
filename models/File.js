var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var FileSchema = new Schema({
    uuid: String,
    filename: {
        type: String,
        trim: true,
    },

    isFolder: {
       type: Boolean,
       default: false,
    },

    filepath: {
        type: String,
        require: true
    },

    size: String,
    mimetype: String,

    parent: {
        type:Schema.Types.ObjectId,
        ref: 'File'
    },

    files: [{type: Schema.Types.ObjectId, ref: 'File'}],

    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },

    token: {
        type: Schema.Types.ObjectId, 
        ref: 'Token'
    },

    createdAt: {
        type: Date, 
        default: Date.now()
    }
}); 


var File = module.exports = mongoose.model('File', FileSchema);

module.exports.newFolder = function(folder, callback) {
    folder.save(callback);
};

module.exports.newFile = function(file, callback) {
    File.insert(file, callback);
};

module.exports.delete = function(id, onRemoveFile, onAllSuccess) {
    File.findById(id).populate('token').exec(function(err, file) {
        if (file) {
            if (err) throw err;
            removeFolder(id, onRemoveFile);
            onAllSuccess(file);
        }
    });
};

function removeFolder(id, onRemoveFile) {
    File.findByIdAndDelete(id).populate('files').populate('token').exec(function(error, file) {
        if (file) {
            if (file.isFolder) {
                file.files.forEach(function(child) {
                    removeFolder(child, onRemoveFile);
                });
            } else {
                onRemoveFile(error, file);
            }
        }
    });
}
