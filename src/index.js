

require('dotenv').config();
const { Client, IntentsBitField, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
token = process.env.TOKEN
dbtoken = process.env.DB_TOKEN

prefix = '!sc' // You can set this to whatever you want
botID = "" // pulled automatically on startup, dont worry about setting this
settingsDict = {} // set up as key = GuildID, values = {goodChannel, badChannel, goodEmoji, badEmoji, minReacts, adminRole}


const { goodSchema, badSchema, settingsSchema, scoreSchema } = require('./Schemas/schemas');
// Key: original message, Value: starred message
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions
    ],
    partials:
        [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction
        ]
});

// bot code

(async () => {
    try {
        await mongoose.connect(dbtoken);
        console.log("connected to database")
    } catch (error) {
        console.log(error)
    }

})();

// Log in 
client.login(token);

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    botID = client.user.id
    const guilds = client.guilds.cache;


    //caching
    for (let guild of guilds.values()) {
        // Fetch all members of the guild
        try {
            await guild.members.fetch();  // This fetches and caches all members in the guild
            console.log(`all members cached in ${guild.name}`);
        } catch (err) {
            console.error(`Error fetching members for guild ${guild.name}:`, err);
        }
    }

    client.guilds.cache.forEach(async guild => {
        try {
            // Fetch all channels of the guild
            const channels = await guild.channels.fetch(); // This fetches all channels
            console.log(`Cached ${channels.size} channels in ${guild.name}`);
            applyServerSettings(guild.id)
        } catch (error) {
            console.error(`Failed to fetch channels for guild ${guild.name}:`, error);
        }
    });



});

client.on('messageCreate', async msg => {
    handleResponses(msg)
});


client.on('messageReactionAdd', async (reaction, user) => {
    // When a reaction is received, check if the structure is partial
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    // Check if the server is registered in the bot's database/apply the settings to dictionary
    applyServerSettings(reaction.message.guild.id)

    //get settings for server the reaction was recieved in
    serverSettings = settingsDict[reaction.message.guild.id]
    goodChannel = serverSettings[0]
    badChannel = serverSettings[1]
    goodEmoji = serverSettings[2]
    badEmoji = serverSettings[3]
    minReacts = serverSettings[4]
    adminRole = serverSettings[5]

    //Check if the user being reacted is in the bot's database or not
    if (await checkIfUsed(scoreSchema, ['serverID', 'userID'], [reaction.message.guild.id, reaction.message.author.id]) == false) {
        console.log("New user detected, registering them to database")
        registerUser(reaction.message.guild.id, reaction.message.author.id)
    } else {
        console.log("User already in database!")
    }

    //Check if the reaction matches the server's bad emoji
    if (reaction.emoji.name == badEmoji) {

        //Check for if channel is not set (0 is the default value)
        if (badChannel == '0') {
            reaction.message.channel.send("You currently have no channel set for " + badEmoji + "s, set one with " + prefix + " set-bad-channel")
        } else {

            console.log(`${reaction.message.author} shroomed message : "${reaction.message.content}"`);
            console.log(`this message has ${reaction.count} shrooms`);

            //check if the post has enough reacts to get on the board
            if (reaction.count >= minReacts && reaction.count != null) {

                //Check for if server emoji is a custom emoji
                const emojiCheck = await reaction.message.guild.emojis.cache.find(emoji => emoji.name == badEmoji)
                console.log(emojiCheck)
                if (emojiCheck == undefined) {
                    try {
                        boardMessage(badSchema, reaction.message, reaction.count, badEmoji, badChannel, true)
                    } catch (error) {
                        console.log(error)
                        reaction.message.channel.send("Could not send message to board, was the channel deleted?")
                    }
                    //If custom emoji modify board message to properly send it
                } else {
                    try {
                        boardMessage(badSchema, reaction.message, reaction.count, "<:" + emojiCheck.name + ":" + emojiCheck.id + ">", badChannel, true)
                    } catch (error) {
                        console.log(error)
                        reaction.message.channel.send("Could not send message to board, was the channel deleted?")
                    }
                }
                console.log("Saved post to bad schema")
                //Update points in database
                updatePoints(reaction.message.guild.id, reaction.message.author.id, 'badPoints', 1)
            }
        }
    }

    //Check if the reaction matches the server's good emoji
    if (reaction.emoji.name == goodEmoji) {
        //Check for if channel is not set (0 is the default value)
        if (goodChannel == '0') {
            reaction.message.channel.send("You currently have no channel set for " + goodEmoji + "s, set one with " + prefix + " set-good-channel")
        } else {
            console.log(`${reaction.message.author} meloned message : "${reaction.message.content}"`);
            console.log(`this message has ${reaction.count} melons`);

            //check if the post has enough reacts to get on the board
            if (reaction.count >= minReacts && reaction.count != null) {

                //Check for if server emoji is a custom emoji
                const emojiCheck = await reaction.message.guild.emojis.cache.find(emoji => emoji.name == goodEmoji)
                console.log(emojiCheck)
                if (emojiCheck == undefined) {
                    try {
                        console.log("sent good board message attempt")
                        boardMessage(goodSchema, reaction.message, reaction.count, goodEmoji, goodChannel, true)
                    } catch (error) {
                        console.log(error)
                        reaction.message.channel.send("Could not send message to board, was the channel deleted?")
                    }
                    //If custom emoji modify board message to properly send it
                } else {
                    try {
                        console.log("sent good board message attempt")
                        boardMessage(goodSchema, reaction.message, reaction.count, "<:" + emojiCheck.name + ":" + emojiCheck.id + ">", goodChannel, true)
                    } catch (error) {
                        console.log(error)
                        reaction.message.channel.send("Could not send message to board, was the channel deleted?")
                    }
                }
                console.log("Saved post to good schema")
                //Update points in database
                updatePoints(reaction.message.guild.id, reaction.message.author.id, 'goodPoints', 1)
            }
        }
    }

    //Everything below are related to message commands in the handleResponses() function

    //Connected to the set-good-emoji command
    //Checks if the message contains the text that the bot is set up to send in the good emoji command
    if (reaction.message.author.id == botID && reaction.message.content == "React with the emoji you want to use for the good board") {
        if (reaction.emoji.imageURL() == null) {
            reaction.message.edit("Set good emoji to " + reaction.emoji.name)
        } else {
            reaction.message.edit("Set good emoji to " + "<:" + reaction.emoji.name + ":" + reaction.emoji.id + ">")
        }
        //Update settings in the database and apply them to the dictionary
        updateSchemaEntry(settingsSchema, ['serverID'], [reaction.message.guild.id], 'goodEmoji', reaction.emoji.name)
        applyServerSettings(reaction.message.guild.id)
    }

    //Connected to the set-good-emoji command
    //Checks if the message contains the text that the bot is set up to send in the good emoji command
    if (reaction.message.author.id == botID && reaction.message.content == "React with the emoji you want to use for the bad board") {
        if (reaction.emoji.imageURL() == null) {
            reaction.message.edit("Set bad emoji to " + reaction.emoji.name)
        } else {
            reaction.message.edit("Set bad emoji to " + "<:" + reaction.emoji.name + ":" + reaction.emoji.id + ">")
        }
        //Update settings in the database and apply them to the dictionary
        updateSchemaEntry(settingsSchema, ['serverID'], [reaction.message.guild.id], 'badEmoji', reaction.emoji.name)
        applyServerSettings(reaction.message.guild.id)
    }

});


client.on('messageReactionRemove', async (reaction, user) => {
    // When a reaction is received, check if the structure is partial
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }


    //If a reaction is removed before one is added im going to assume its not for the purpose of the bot so im not going to do a database check for the server here

    //get settings for server the reaction was recieved in
    serverSettings = settingsDict[reaction.message.guild.id]
    goodChannel = serverSettings[0]
    badChannel = serverSettings[1]
    goodEmoji = serverSettings[2]
    badEmoji = serverSettings[3]
    minReacts = serverSettings[4]
    adminRole = serverSettings[5]

    //Check if the user being reacted is in the bot's database or not
    if (await checkIfUsed(scoreSchema, ['serverID', 'userID'], [reaction.message.guild.id, reaction.message.author.id]) == false) {
        console.log("New user detected, registering them to database")
        registerUser(reaction.message.guild.id, reaction.message.author.id)
    } else {
        console.log("User already in database!")
    }

    //Check if the removed reaction matches the server's bad emoji
    if (reaction.emoji.name == badEmoji) {
        console.log(`${reaction.message.author} shroomed message : "${reaction.message.content}"`);
        console.log(`this message has ${reaction.count} shrooms`);

        //Check for if server emoji is a custom emoji
        const emojiCheck = await reaction.message.guild.emojis.cache.find(emoji => emoji.name == badEmoji)
        console.log(emojiCheck)
        if (emojiCheck == undefined) {
            try {
                boardMessage(badSchema, reaction.message, reaction.count, badEmoji, badChannel, true)
            } catch (error) {
                console.log(error)
                reaction.message.channel.send("Could not update board message, was it deleted?")
            }
            //If custom emoji modify board message to properly send it
        } else {
            try {
                boardMessage(badSchema, reaction.message, reaction.count, "<:" + emojiCheck.name + ":" + emojiCheck.id + ">", badChannel, true)
            } catch (error) {
                console.log(error)
                reaction.message.channel.send("Could not update board message, was it deleted?")
            }

        }
        console.log("Saved post to bad schema")
        updatePoints(reaction.message.guild.id, reaction.message.author.id, 'badPoints', -1)
    }






    if (reaction.emoji.name == goodEmoji) {
        console.log(`${reaction.message.author} meloned message : "${reaction.message.content}"`);
        console.log(`this message has ${reaction.count} melons`);

        //Check for if server emoji is a custom emoji
        const emojiCheck = await reaction.message.guild.emojis.cache.find(emoji => emoji.name == goodEmoji)
        console.log(emojiCheck)
        if (emojiCheck == undefined) {
            try {
                //Calling board message on an existing message will edit it
                boardMessage(goodSchema, reaction.message, reaction.count, goodEmoji, goodChannel, true)
            } catch (error) {
                console.log(error)
                reaction.message.channel.send("Could not update board message, was it deleted?")
            }
            //If custom emoji modify board message to properly send it
        } else {
            try {
                //Calling board message on an existing message will edit it
                boardMessage(goodSchema, reaction.message, reaction.count, "<:" + emojiCheck.name + ":" + emojiCheck.id + ">", goodChannel, true)
            } catch (error) {
                console.log(error)
                reaction.message.channel.send("Could not update board message, was it deleted?")
            }

        }
        console.log("Saved post to good schema")
        //Update points in database
        updatePoints(reaction.message.guild.id, reaction.message.author.id, 'goodPoints', -1)



    }

});

// custom functions

function createEmbed(message) {

    messageURL = message.url
    messageContent = message.content
    authorName = message.author.displayName
    authorAvatar = message.author.displayAvatarURL()
    messageTimestamp = message.createdTimestamp

    let compatibleAttachments = []
    if (message.attachments.size > 0) {
        // Loop through all attachments
        message.attachments.forEach((attachment) => {
            // Output the attachment URL and content type (MIME type)
            if (attachment.contentType.includes("image")) {
                compatibleAttachments.push(attachment.url)
            }
        });
    }


    if (message.embeds.length > 0) {
        const embed = message.embeds[0]
        console.log("message has embed")
        console.log(embed.video.url)
        if (embed.video != null && embed.video.url.includes("media.tenor")) {
            //Restructure the link into something actually usable by the embed, tenor uses standard formatting for their
            //gif links so we can convert the share link into the gif link using that
            const imageUrl = embed.video.url.replace(".mp4", ".gif").replace("AAAPo", "AAAAd").replace("media.tenor.com", "c.tenor.com")
            console.log(imageUrl)
            compatibleAttachments.push(imageUrl)
        }
        else if (embed.image != null) {
            const imageUrl = embed.image.url;
            //EMBED.THUMBNAIL WORKS FOR YOUTUBE THUMBNAILS
        } else if (embed.thumbnail != null) {

            compatibleAttachments.push(embed.thumbnail.url)
        } else {
            console.log("theres nothing")
        }
    }

    let embedArray = []

    //runs if the message has no content and only one attachment
    if (messageContent == '' && compatibleAttachments.length == 1) {
        console.log("found empty message and only 1 attachment")
        embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setURL(messageURL)
            .setAuthor({ name: authorName, iconURL: authorAvatar, url: messageURL })
            .setImage(compatibleAttachments[0])
            .setTimestamp(messageTimestamp)
        embedArray.push(embed)
    //runs if the message has no content and there are multiple or no attachments
    } else if (messageContent == '' && compatibleAttachments.length > 1 || messageContent == undefined && compatibleAttachments.length == 0) {
        console.log("found empty message and multiple or no attachments")
        embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setURL(messageURL)
            .setAuthor({ name: authorName, iconURL: authorAvatar, url: messageURL })
            .setTimestamp(messageTimestamp)
        embedArray.push(embed)
    //runs if message has only 1 attachment
    } else if (compatibleAttachments.length == 1) {
        console.log("found message and only 1 attachment")
        embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setURL(messageURL)
            .setAuthor({ name: authorName, iconURL: authorAvatar, url: messageURL })
            .setImage(compatibleAttachments[0])
            .setDescription(messageContent)
            .setTimestamp(messageTimestamp)
        embedArray.push(embed)
    //runs if message has more than one or no attachments    
    } else if (compatibleAttachments.length > 1 || compatibleAttachments.length == 0) {
        console.log("found message and multiple or no attachments")
        embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setURL(messageURL)
            .setAuthor({ name: authorName, iconURL: authorAvatar, url: messageURL })
            .setDescription(messageContent)
            .setTimestamp(messageTimestamp)
        embedArray.push(embed)
    }
    /*discord doesnt actually natively let you do multiple images in one embed
    but you can do a weird workaround by setting multiple embeds with the same url
    which is what im doing here*/
    if (compatibleAttachments.length > 0 && compatibleAttachments.length != 1) {
        console.log("multiple images found, looping")
        for (let i = 0; i < compatibleAttachments.length; i++) {
            if (i <= 3) {
                embed = new EmbedBuilder()
                    .setURL(message.url)
                    .setImage(compatibleAttachments[i])
                embedArray.push(embed)
            } else if (i <= 7) {
                embed = new EmbedBuilder()
                    //even with the trick you can only do 4 images per embed so it adds a / here to start a new message and allow 4 more images
                    .setURL(message.url + "/")
                    .setImage(compatibleAttachments[i])
                embedArray.push(embed)
                //any remaining messages accounted for here since max upload limit is 10
            } else {
                embed = new EmbedBuilder()
                    .setURL(message.url + "//")
                    .setImage(compatibleAttachments[i])
                embedArray.push(embed)
            }
        }
    }
    return embedArray
}

// Possible video support, doesnt work due to discord's bot filesize limitations.

// async function createAttachments(attachments){
//     let compatibleAttachments = []
//     try{
//         if (attachments.size > 0) {
//             // Loop through all attachments
//             attachments.forEach((attachment) => {
//                 // Output the attachment URL and content type (MIME type)
//                 console.log(attachment.contentType)
//                 if (attachment.contentType.includes("video")) {
//                     console.log("found video")
//                     compatibleAttachments.push(new AttachmentBuilder(attachment.url))
//                 }
//             });
//         }
//     } catch (error) {
//         if (error.message.includes('Request entity too large')){
//             console.log("file size too large")
//         }else{
//             console.log(error)
//         }
//     }
    
//     return compatibleAttachments
// }


async function boardMessage(schema, funcMessage, reactCount, emoji, channelID, addToDatabase) {
    //Check if the message is already in the database
    const used = await checkIfUsed(schema, ['original'], [funcMessage.id]);
    serverSettings = settingsDict[funcMessage.guild.id]
    minReacts = serverSettings[4]
    //Fetch the channel using the channel id
    channelUsable = await client.channels.fetch(channelID)
    //Prevent react count as being shown as "null" when there are no reactions
    if (reactCount == null) {
        reactCount = 0
    }
    try {
        //If message is not already in database, send message in board channel
        if (!used && reactCount >= minReacts || !addToDatabase) {



            //Create the embed for the message
            let boardEmbed = createEmbed(funcMessage);
            const botMessage = await channelUsable.send({ content: "**" + reactCount + "** " + emoji + " | " + funcMessage.url, embeds: boardEmbed});
            console.log("sent embed");

            if (addToDatabase) {
                //Setup post information to send into database
                const newPost = new schema({
                    serverID: funcMessage.guild.id,
                    userID: funcMessage.author.id,
                    original: funcMessage.id,
                    board: botMessage.id,
                    reactions: reactCount,
                });


                //Save post information to database
                try {
                    await newPost.save();
                } catch (err) {
                    console.error('Error adding post:', err);
                }
            }
            //If message is already in database (else), edit the existing board message
        } else {
            //Create the embed for the message
            let boardEmbed = createEmbed(funcMessage);
            //Pull the board message ID from the database using the ID of the original message
            const msgId = await pullFromSchema(schema, ['original'], [funcMessage.id], 'board');

            if (msgId) {
                const msg = await channelUsable.messages.fetch(msgId);
                msg.edit({ content: "**" + reactCount + "** " + emoji + " | " + funcMessage.url, embeds: boardEmbed });
                //Update post in database
                if (addToDatabase) {
                    updateSchemaEntry(schema, ['original'], [funcMessage.id], 'reactions', reactCount.toString())
                }
                console.log("edited embed");
            }
        }
    } catch (error) {
        console.log("BOARD ERROR: ")
        console.log(error)
        console.log(error.stack)
    }
}


async function checkChannelValidity(channelID) {
    //Tries to fetch channel and if it fails the catch is triggered and it returns false
    try {
        await client.channels.fetch(channelID);
        return true
    } catch (error) {
        console.log("Not a valid channel")
        return false
    }

}

async function pullFromSchema(schema, item, key, field) {
    //Item & key parameters are required to be arrays
    try {
        const query = {}
        //Loops through array and adds it to the query dictionary
        for (let i = 0; i < item.length; i++) {
            query[item[i]] = key[i];
        }
        //Find the post that matches the query in the database
        const post = await schema.findOne(query);
        if (post) {
            //Return the entry
            return post[field];
        } else {
            console.log('Post not found');
            return null;  // return null if post is not found
        }
    } catch (err) {
        console.error('Error:', err);
        return null;  // return null in case of error
    }
}

async function checkIfUsed(schema, item, key) {
    //Item & key parameters are required to be arrays
    try {
        const query = {};
        //Loops through array and adds it to the query dictionary
        for (let i = 0; i < item.length; i++) {
            query[item[i]] = key[i];
        }
        //See if theres a post that matches the query in the database
        const post = await schema.findOne(query);
        if (post) {
            // If post is found, return true
            return true;
        } else {
            // If no document is found, return false
            return false;
        }
    } catch (err) {
        console.error('Error:', err);
        return false;  // return false in case of error
    }
}

async function updateSchemaEntry(schema, item, key, updateKey, newData) {
    //Item & key parameters are required to be arrays
    try {
        const query = {};
        //Loops through array and adds it to the query dictionary
        for (let i = 0; i < item.length; i++) {
            query[item[i]] = key[i];
        }
        //Format the new data into a dictionary so it can be used
        const newDataDict = {};
        newDataDict[updateKey] = newData;
        newDataUsable = {
            $set: { [updateKey]: newData }
        }
        //Update the database
        const post = await schema.findOneAndUpdate(query, newDataUsable, { upsert: true })

        if (post) {
            //return post.board;
            console.log("Edited entry in schema")
        } else {
            console.log('Post not found');
            return null;  // return null if post is not found
        }
    } catch (err) {
        console.error('Error:', err);
        return null;  // return null in case of error

    }

}

async function updatePoints(serverID, userID, type, amount) {
    //Pull the amount of points the user has from the database
    let points = await pullFromSchema(scoreSchema, ['serverID', 'userID'], [serverID, userID], type)
    //Add the amount to the user's points
    points = parseInt(points) + amount
    //Update the database with the new points amount
    updateSchemaEntry(scoreSchema, ['serverID', 'userID'], [serverID, userID], type, points.toString())
}

async function registerUser(serverID, userID) {
    //Set up and entry to be added to the database
    const newPost = new scoreSchema({
        serverID: serverID,
        userID: userID,
        goodPoints: '0',
        badPoints: '0',
    });
    //Enter the data into the database
    await newPost.save();
}

async function applyServerSettings(serverID) {

    console.log("Guild ID: " + serverID);
    //Check if the server is already in the database
    const used = await checkIfUsed(settingsSchema, ['serverID'], [serverID])
    if (used) {
        console.log("Server already in database")
        //If server is not in database, set up an entry and add it
    } else {
        console.log("Server not in database")
        const newPost = new settingsSchema({
            serverID: serverID,
            goodChannel: '0',
            badChannel: '0',
            goodEmoji: '🍉',
            badEmoji: '🍄',
            minReacts: "3",
            adminRole: '0',
        });
        await newPost.save();

    }
    //Pull server's settings from the database
    serverSettings = await settingsSchema.findOne({ "serverID": serverID })
    //Add the settings to a dictionary so the database doesnt need to be called everytime settings are needed
    settingsDict[serverID] = [serverSettings.goodChannel, serverSettings.badChannel, serverSettings.goodEmoji, serverSettings.badEmoji, serverSettings.minReacts, serverSettings.adminRole]
}

async function findMessageById(server, msgID) {
    for (const channel of server.channels.cache.values()) {
        if (channel.isTextBased()) { // Ensures it's a text channel
            try {
                const message = await channel.messages.fetch(msgID);
                if (message) return message;
            } catch (error) {
                // Ignore errors (e.g., message not found in that channel)
                if (error.code !== 10008) console.error(error); // 10008 = Unknown Message
            }
        }
    }
    return null; // Message not found in any channel
}

async function findLargestOrderInSchema(server_id, schema, num) {
    try {
        const result = await schema.aggregate([
            {
                $match: { serverID: server_id } // Match documents with the specified serverID
            },
            {
                $addFields: {
                    reactionsNumeric: { $toDouble: "$reactions" } // Convert reactions to a numeric value if needed
                }
            },
            {
                $sort: { reactionsNumeric: -1 } // Sort by reactions in descending order
            }
        ]);
        return result[num];        // Return the first item as the result
    } catch (error) {
        console.error('Error finding document:', error);
        return null;  // Return null or a default value if there's an error
    }
}



async function handleResponses(message) {
    serverSettings = settingsDict[message.guild.id]


    //Shows all the commands for the bot
    if (message.content == prefix + " help") {
        const messageEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("**General Commands:**")
            .setDescription(prefix + " score\n" + prefix + " top-good [NUM (optional)] \n" + prefix + " top-bad [NUM (optional)]\n" + prefix + " random\n" + prefix + " random-good\n" + prefix + " random-bad")
        message.channel.send({ embeds: [messageEmbed] })
    }

    if (message.content.substr(0, prefix.length + " score".length) == prefix + " score") {
        try {


            spliced = message.content.substr(prefix.length + " score".length + 1)
            if (spliced == "") {
                scoreID = message.author.id
            } else {
                scoreID = ""
                const isNumeric = (string) => Number.isFinite(+string)
                for (let i = 0; i < message.content.length; i++) {
                    if (message.content[i] == ">") {
                        break;
                    }
                    if (isNumeric(message.content[i]) && message.content[i] != " ") {
                        scoreID = scoreID + message.content[i]
                    }
                }
            }
            let userFetch = message.guild.members.cache.get(scoreID);
            //Check if the user is entered into the database
            if (await checkIfUsed(scoreSchema, ['serverID', 'userID'], [message.guild.id, scoreID]) == false) {
                console.log("New user detected, registering them to database")
                registerUser(message.guild.id, scoreID)
                message.channel.send("You have no score!")
            } else {
                console.log("User found in database!")
                //Pull points from database
                const goodPoints = await pullFromSchema(scoreSchema, ['serverID', 'userID'], [message.guild.id, scoreID], 'goodPoints')
                const badPoints = await pullFromSchema(scoreSchema, ['serverID', 'userID'], [message.guild.id, scoreID], 'badPoints')
                //Get total score by subtracting bad points from good points
                const total = parseInt(goodPoints) - parseInt(badPoints)

                //Make embed and send
                const messageEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(userFetch.user.globalName + "'s Social Credit Score:\n\nGood:" + goodPoints + "\nBad: " + badPoints + "\n\n**Total: " + total.toString() + "**")
                message.channel.send({ embeds: [messageEmbed] });
            }
        } catch (error) {
            message.channel.send("Could not find user")
        }
    }

    try {


        // top good command
        if (message.content.substr(0, prefix.length + " top-good".length) == prefix + " top-good") {
            //if the user enters a number, this pulls it
            spliced = message.content.substr(prefix.length + " top-good".length + 1)

            //gets the total number of good post entries in the database for the server
            totalin = await goodSchema.countDocuments({serverID: message.guild.id});

            //if user enters no number just display the post with the most good reactions
            if (spliced == "") {
                //find post with the largest number of good reactions
                const largest = await findLargestOrderInSchema(message.guild.id, goodSchema, 0)
                //pull the message via the message id in the database
                const msg = await findMessageById(message.guild, largest.original)
                //make the embed
                boardMessage(goodSchema, msg, largest.reactions, serverSettings[2], message.channel.id, false)
            //if user enters a specific number show them the post at that index in the database
            } else if (parseInt(spliced) - 1 <= totalin) {
                //find post at requested index
                const largest = await findLargestOrderInSchema(message.guild.id, goodSchema, parseInt(spliced) - 1)
                //pull the message via the id in the database
                const msg = await findMessageById(message.guild, largest.original)
                //make the embed
                boardMessage(goodSchema, msg, largest.reactions, serverSettings[2], message.channel.id, false)
            } else {
                //if index user requested was outside the range of the database, return this
                message.channel.send("Number provided is outside of range. There are currently " + totalin + " good posts in the database.")
            }
        }


        // top bad command
        if (message.content.substr(0, prefix.length + " top-bad".length) == prefix + " top-bad") {
            //if the user enters a number, this pulls it
            spliced = message.content.substr(prefix.length + " top-bad".length + 1)

            //gets the total number of bad post entries in the database for the server
            totalin = await badSchema.countDocuments({serverID: message.guild.id});
            
            //if user enters no number just display the post with the most bad reactions
            if (spliced == "") {
                //find post with largest number of bad reactions
                const largest = await findLargestOrderInSchema(message.guild.id, badSchema, 0)
                //pull the message via the message id in the database
                const msg = await findMessageById(message.guild, largest.original)
                //make the embed
                boardMessage(badSchema, msg, largest.reactions, serverSettings[3], message.channel.id, false)
            
            //if user enters a specific number show them the post at that index in the database
            } else if (parseInt(spliced) - 1 <= totalin && parseInt(spliced) != 0) {
                //find post at requested index
                const largest = await findLargestOrderInSchema(message.guild.id, badSchema, parseInt(spliced) - 1)
                //pull the message via the message id in the database
                const msg = await findMessageById(message.guild, largest.original)
                //create embed & send message
                boardMessage(badSchema, msg, largest.reactions, serverSettings[3], message.channel.id, false)
            } else {
                //if index user requested was outside the range of the database, return this
                message.channel.send("Number provided is outside of range. There are currently " + totalin + " bad posts in the database.")
            }
        }

        //random post command
        if (message.content == prefix + " random") {
            //pull random number to decide whether to pull good or bad post
            chooseType = getRandomInt(0, 1)
            if (chooseType == 0) {
                schema = goodSchema
                emoji = serverSettings[2]
            } else if (chooseType == 1) {
                schema = badSchema
                emoji = serverSettings[3]
            }
            //gets the total number of bad/good post entries in the database for the server
            totalin = await schema.countDocuments({serverID: message.guild.id});
            //generate index number based on total number of posts
            randomPost = await getRandomInt(0, totalin - 1)
            //find post at random index
            const post = await findLargestOrderInSchema(message.guild.id, schema, randomPost)
            //pull the message via the message id in the database
            const msg = await findMessageById(message.guild, post.original)
            //create embed & send message
            boardMessage(schema, msg, post.reactions, emoji, message.channel.id, false)
        }

        //random good post command
        if (message.content == prefix + " random-good") {
            //gets total number of good posts
            totalin = await goodSchema.countDocuments({serverID: message.guild.id});
            //generate index number based on total number of posts
            randomPost = await getRandomInt(0, totalin - 1)
            //find post at random index
            const post = await findLargestOrderInSchema(message.guild.id, goodSchema, randomPost)
            //pull the message via the message id in the database
            const msg = await findMessageById(message.guild, post.original)
            //create embed & send message
            boardMessage(goodSchema, msg, post.reactions, serverSettings[2], message.channel.id, false)
        }

        //random bad post command
        if (message.content == prefix + " random-bad") {
            //gets the total number of bad posts
            totalin = await badSchema.countDocuments({serverID: message.guild.id});
            //generate index number based on total number of posts
            randomPost = await getRandomInt(0, totalin - 1)
            //find post at random index
            const post = await findLargestOrderInSchema(message.guild.id, badSchema, randomPost)
            //pull the message via the message id in the database
            const msg = await findMessageById(message.guild, post.original)
            //create embed & send message
            boardMessage(badSchema, msg, post.reactions, serverSettings[3], message.channel.id, false)
        }
    } catch (error) {
        console.log("Something went wrong")
        console.log(error)
    }


    // admin only commands

    adminRole = serverSettings[5]
    const member = message.guild.members.cache.get(message.author.id);
    try {


        if (adminRole == '0' || member.roles.cache.has(adminRole)) {
            //Shows all the commands for changing the bot's settings
            if (message.content == prefix + " help settings") {
                const messageEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle("**Server Settings Commands:**")
                    .setDescription("**Channels:**\n" + prefix + " set-good-channel [CHANNEL ID]\n" + prefix + " set-bad-channel [CHANNEL ID]\n\n **Reactions:**\n" + prefix + " set-good-emoji\n" + prefix + " set-bad-emoji\n" + prefix + " set-min-reacts [AMOUNT]")
                message.channel.send({ embeds: [messageEmbed] })
            }

            //Sets good channel by channel id
            if (message.content.substr(0, prefix.length + " set-good-channel".length) == prefix + " set-good-channel") {
                try {
                    //Get the channel id by slicing the message and fetch the channel with it
                    await client.channels.fetch(message.content.substr(prefix.length + " set-good-channel".length + 1));
                    //Update the good channel in database
                    updateSchemaEntry(settingsSchema, ['serverID'], [message.guild.id], 'goodChannel', message.content.substr(prefix.length + " set-good-channel".length + 1))
                    //Apply the new settings to the server
                    applyServerSettings(message.guild.id)
                    message.reply("Updated " + settingsDict[message.guild.id][2] + " channel")
                } catch (error) {
                    message.reply("Please enter a valid channel")
                    console.log(error)
                }
            }

            //Sets bad channel by channel id
            if (message.content.substr(0, prefix.length + " set-bad-channel".length) == prefix + " set-bad-channel") {
                try {
                    //Get the channel id by slicing the message and fetch the channel with it
                    await client.channels.fetch(message.content.substr(prefix.length + " set-bad-channel".length + 1));
                    //Update the bad channel in database
                    updateSchemaEntry(settingsSchema, ['serverID'], [message.guild.id], 'badChannel', message.content.substr(prefix.length + " set-bad-channel".length + 1))
                    //Apply the new settings to the server
                    applyServerSettings(message.guild.id)
                    message.reply("Updated " + settingsDict[message.guild.id][3] + " channel")
                } catch (error) {
                    message.reply("Please enter a valid channel")
                    console.log(error)
                }
            }

            //set good emoji command, linked to code in messageReactionAdd
            if (message.content == prefix + " set-good-emoji") {
                message.channel.send("React with the emoji you want to use for the good board")
            }

            //set bad emoji command, linked to code in messageReactionAdd
            if (message.content == prefix + " set-bad-emoji") {
                message.channel.send("React with the emoji you want to use for the bad board")
            }

            if (message.content.substr(0, prefix.length + " set-min-reacts".length) == prefix + " set-min-reacts") {

                //Slice the message to get the number the user entered
                reactNum = parseInt(message.content.substr(prefix.length + " set-min-reacts".length + 1))
                //Check to see if the number is valid
                if (!isNaN(reactNum)) {
                    //Update minimum reactions in database
                    updateSchemaEntry(settingsSchema, ['serverID'], [message.guild.id], 'minReacts', message.content.substr(prefix.length + " set-min-reacts".length + 1))
                    //Apply the new settings to the server
                    applyServerSettings(message.guild.id)
                    message.reply("Set minimum reactions to " + message.content.substr(prefix.length + " set-min-reacts".length + 1) + ".")
                } else {
                    console.log("Not a valid number.")
                }
            }

            if (message.content.substr(0, prefix.length + " set-admin-role".length) == prefix + " set-admin-role") {
                try {
                    //Get the channel id by slicing the message and fetch the channel with it
                    //Update the bad channel in database
                    updateSchemaEntry(settingsSchema, ['serverID'], [message.guild.id], 'adminRole', message.content.substr(prefix.length + " set-admin-role".length + 1))
                    //Apply the new settings to the server
                    applyServerSettings(message.guild.id)
                    message.reply("Updated admin role")
                } catch (error) {
                    message.reply("Please enter a valid role")
                    console.log(error)
                }
            }


        }
    } catch (error) {
        console.log("admin role error:")
        console.log(error)
    }

    //random int function
    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }



}
