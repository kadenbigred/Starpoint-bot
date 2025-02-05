const mongoose = require('mongoose');

// Define the schema for the dictionary
const goodPostsSchema = new mongoose.Schema({
    serverID: {type: String, required: true},
    userID: {type: String, rwquired: true},
    original: {type: String, required: true},
    board: {type: String, required: true}, 
    reactions: {type: String, required: true},
});

const badPostsSchema = new mongoose.Schema({
    serverID: {type: String, required: true},
    userID: {type: String, rwquired: true},
    original: {type: String, required: true},
    board: {type: String, required: true}, 
    reactions: {type: String, required: true},
});

const serverSettingsSchema = new mongoose.Schema({
    serverID: {type: String, required: true},
    goodChannel: {type: String, required: true}, 
    badChannel: {type: String, required: true},
    goodEmoji: {type: String, required: true}, 
    badEmoji: {type: String, required: true},
    minReacts: {type: String, required: true},
});

const userScoreSchema = new mongoose.Schema({
    serverID: {type: String, required: true},
    userID: {type: String, required: true}, 
    goodPoints: {type: String, required: true},
    badPoints: {type: String, required: true}, 
});

// Create a model for the schema
const goodSchema = mongoose.model('goodSchema', goodPostsSchema)
const badSchema = mongoose.model('badSchema', badPostsSchema)
const settingsSchema = mongoose.model('settingsSchema', serverSettingsSchema)
const scoreSchema = mongoose.model('scoreSchema', userScoreSchema)

module.exports = {goodSchema, badSchema, settingsSchema, scoreSchema}