
// Auth Token - You can generate your token from 
// https://<slack_name>.slack.com/services/new/bot
var token = process.env.SLACK_BOT_TOKEN || "...";
var mongo = process.env.MONGOHQ_URL || 'mongodb://localhost/superscriptDB';

// This is the main Bot interface
var superscript = require("superscript");
var mongoose = require("mongoose");
mongoose.connect( mongo );

var CheckStagingSchema = mongoose.Schema({
	user: String,
	createdAt: { type: Date, default: Date.now }
});

var CheckStaging = mongoose.model('CheckStaging', CheckStagingSchema);

// slack-client provides auth and sugar around dealing with the RealTime API.
var Slack = require("slack-client");

var debug = require('debug')("Slack Client");
var facts = require("sfacts");
var factSystem = facts.explore("botfacts");
var TopicSystem = require("superscript/lib/topics/index")(mongoose, factSystem);
console.log( "Server running" );

// How should we reply to the user? 
// direct - sents a DM
// atReply - sents a channel message with @username
// public sends a channel reply with no username
var replyType = "atReply";

var atReplyRE = /<@(.*?)>/;
var options = {};
options['factSystem'] = factSystem;
options['mongoose'] = mongoose;
options['scope'] = {
	'getCheckStaging': function() { 
		return CheckStaging;
	}
};

var express = require('express');
var app = express();

app.get('/', function(req, res){
  res.send('Hello! This is Fusion Rubberduck');
});
 
var port = process.env.PORT || 3000;

app.listen(port);


var slack = new Slack(token, true, true);

var botHandle = function(err, bot) {
  slack.login();

  slack.on('error', function(error) {
    console.error("Error:");
    console.log(error);
  });

  slack.on('open', function(){
    console.log("Welcome to Slack. You are %s of %s", slack.self.name, slack.team.name);
  });

  slack.on('close', function() {
    console.warn("Disconnected");
  });

  slack.on('message', function(data) {
    receiveData(slack, bot, data);
  });
};

var receiveData = function(slack, bot, data) {

  // Fetch the user who sent the message;
  var user = data._client.users[data.user];
  var channel;
  var messageData = data.toJSON();
  var message = "";

  if (messageData && messageData.text) {
    message = "" + messageData.text.trim();
  }

  var match = message.match(atReplyRE);
  
  // Are they talking to us?
  if (match && match[1] === slack.self.id) {

    message = message.replace(atReplyRE, '').trim();
    if (message[0] == ':') {
        message = message.substring(1).trim();
    }

    bot.reply(user.name, message, function(err, reply){
      // We reply back direcly to the user

      switch (replyType) {
        case "direct":
          channel = slack.getChannelGroupOrDMByName(user.name);
          break;
        case "atReply":
          reply.string = "@" + user.name  + " " + reply.string;
          channel = slack.getChannelGroupOrDMByID(messageData.channel);
          break;
        case "public":
          channel = slack.getChannelGroupOrDMByID(messageData.channel);
          break;
      }

      if (reply.string) {
        channel.send(reply.string);
      }
        
    });

  } else if (messageData.channel[0] == "D") {
    bot.reply(user.name, message, function(err, reply){
      channel = slack.getChannelGroupOrDMByName(user.name);
      if (reply.string) {
        channel.send(reply.string);
      }
    });
  } else {
    console.log("Ignoring...", messageData);
    if(message.indexOf('staging') > -1 ) {
	CheckStaging.findOne(function(err, record) {
		if (err) return console.error(err);

		if(record) {
			record.user = user.name;
			record.createdAt = new Date();
			record.save();
		} else {
			new CheckStaging({
				user: user.name
			}).save(function(err) {				
				if (err) return console.error(err);
			});
		}	

	});

    }
  }
};

// Main entry point
TopicSystem.importerFile('./data.json', function(){
  new superscript(options, function(err, botInstance){
    botHandle(null, botInstance);
  });
});
