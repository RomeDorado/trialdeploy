'use strict';

const apiai = require('apiai');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const async = require('async');
const fs = require('fs');


// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
	throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
	throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.API_AI_CLIENT_ACCESS_TOKEN) {
	throw new Error('missing API_AI_CLIENT_ACCESS_TOKEN');
}
if (!config.FB_APP_SECRET) {
	throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
	throw new Error('missing SERVER_URL');
}
if (!config.SENDGRID_API_KEY) { //used for sending email
	throw new Error('missing sendgrid_api_key');
}
if (!config.EMAIL_FROM) { //used for email from
	throw new Error('missing email from');
}
if (!config.EMAIL_TO) { //used for to
	throw new Error('missing email to');
}
app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
	verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
	extended: false
}))

// Process application/json
app.use(bodyParser.json())





const apiAiService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
	language: "en",
	requestSource: "fb"
});
const sessionIds = new Map();

// Index route
app.get('/', function (req, res) {
	res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
	console.log("request");
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
		res.status(200).send(req.query['hub.challenge']);
	} else {
		console.error("Failed validation. Make sure the validation tokens match.");
		res.sendStatus(403);
	}
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * handlemess. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */

app.post('/webhook/', function (req, res) {
	var data = req.body;
	console.log(JSON.stringify(data));



	// Make sure this is a page subscription
	if (data.object == 'page') {
		// Iterate over each entry
		// There may be multiple if batched
		data.entry.forEach(function (pageEntry) {
			var pageID = pageEntry.id;
			var timeOfEvent = pageEntry.time;

			// Iterate over each messaging event
			pageEntry.messaging.forEach(function (messagingEvent) {
				if (messagingEvent.optin) {
					receivedAuthentication(messagingEvent);
				} else if (messagingEvent.message) {
					receivedMessage(messagingEvent);
				} else if (messagingEvent.delivery) {
					receivedDeliveryConfirmation(messagingEvent);
				} else if (messagingEvent.postback) {
					receivedPostback(messagingEvent);
				} else if (messagingEvent.read) {
					console.log("asdfghjgfdsadfghjkhgfdsa");
					receivedMessageRead(messagingEvent);
				} else if (messagingEvent.account_linking) {
					receivedAccountLink(messagingEvent);
				} else {
					console.log("Webhook received unknown messagingEvent: ", messagingEvent);
				}
			});
		});

		// Assume all went well.
		// You must send back a 200, within 20 seconds
		res.sendStatus(200);
	}
});





function receivedMessage(event) {

	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfMessage = event.timestamp;
	var message = event.message;

	if (!sessionIds.has(senderID)) {
		sessionIds.set(senderID, uuid.v1());
	}
	//console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
	//console.log(JSON.stringify(message));

	var isEcho = message.is_echo;
	var messageId = message.mid;
	var appId = message.app_id;
	var metadata = message.metadata;

	// You may get a text or attachment but not both
	var messageText = message.text;
	var messageAttachments = message.attachments;
	var quickReply = message.quick_reply;

	if (isEcho) {
		handleEcho(messageId, appId, metadata);
		return;
	} else if (quickReply) {
		handleQuickReply(senderID, quickReply, messageId);
		return;
	}


	if (messageText) {
		//send message to api.ai
		sendToApiAi(senderID, messageText);
	} else if (messageAttachments) {
		handleMessageAttachments(messageAttachments, senderID);
	}
}


function handleMessageAttachments(messageAttachments, senderID){
	//for now just reply
	//sendTextMessage(senderID, "Attachment received. Thank you.");
}

function handleQuickReply(senderID, quickReply, messageId) {
	var quickReplyPayload = quickReply.payload;
	console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
	//send payload to api.ai
	sendToApiAi(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
	// Just logging message echoes to console
	console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

var clientName = "";

function handleApiAiAction(sender, action, responseText, contexts, parameters) {
	request({
		uri: 'https://graph.facebook.com/v2.7/' + sender,
		qs: {
			access_token: config.FB_PAGE_TOKEN
		}

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {

			var user = JSON.parse(body);

			clientName = user.first_name + ` ${user.last_name}`;

		}
	});

	switch (action) {
		case "send-message":
		let contex = contexts.map(function(obj) {
				let contextObjects = {};
				if(obj.name === "sendmsg"){
					let emailContents = obj.parameters['userMessage'];
					sendEmailInquiry("New Inquiry", emailContents, clientName);
				}
			return contextObjects;
		});
		 	sendTextMessage(sender, responseText);
		break;

		 case "feedback-action":		 
			 let conte = contexts.map(function(obj) {
				let contextObject = {};
				if(obj.name === "feedback"){
					let emailContent = obj.parameters['feedbackMessage'];
					sendEmail("New Feedback", emailContent, clientName);
				}
			return contextObject;
		});
		 	sendTextMessage(sender, responseText);

			console.log(responseText);

		 break;

		 case "input.welcome":
		 setTimeout(function(){
				consumerquickreply(sender, action, responseText, contexts);
				},2000);
		 break;

		 case "enterEmail":
			var cont = contexts.map(function(obj) {
				var contextObj = {};
				if(obj.name === "merchant-existing"){
					let emailaddress = obj.parameters['userEmail'];
					readDirectory(sender, emailaddress);
					console.log(emailaddress + "EMAIL ITO");
				}
			return contextObj;
		});
		sendTextMessage(sender, responseText);

		 break;
		default:
			//unhandled action, just send back the text
			sendTextMessage(sender, responseText);

	}
}


function readDirectory(sender, email){
		var Arry = [];
		var lineReader = require('readline').createInterface({
		input: require('fs').createReadStream('./files/directory')
		});

		lineReader.on('line', function (line) {
		Arry.push(line);
		});


	lineReader.on('close', function (line) {
      console.log("email " + Arry[x]);
      console.log("role" + Arry[x+1]);



		var error = true;
		var count = [];
		for(var x = 0; x < Arry.length; x+=1){
		//console.log(Arry[x]);
		if (Arry[x] == email){

			console.log("email " + Arry[x]);
			console.log("role" + Arry[x+1]);


			var role = Arry[x+1];
			error = false;
			sendToApiAi(sender, role);

			Arry = [];
			break;

			}else{
				error = true;
			//   sendToApiAi(sender, "Existing Merchant");

			}
		}

		if (error == true) {
				// console.log(JSON.stringify(count) + "this is the count");
				sendToApiAi(sender, "Existing Merchant");
			}


		});

}

function handleMessage(message, sender) {

	switch (message.type) {

		case 0: //text

			sendTextMessage(sender, message.speech);
			console.log("handle message napupunta");
		break;

		case 2: //quick replies
			let replies = [];
			for (var b = 0; b < message.replies.length; b++) {
				let reply =
				{
					"content_type": "text",
					"title": message.replies[b],
					"payload": message.replies[b]
				}
				replies.push(reply);
			}
			sendQuickReply(sender, message.title, replies);
			break;
		case 3: //image
			sendImageMessage(sender, message.imageUrl);
			break;
		case 4:
			// custom payload
			var messageData = {
				recipient: {
					id: sender
				},
				message: message.payload.facebook

			};

			callSendAPI(messageData);
			console.log("PAYLOAD LOG");
			break;
	}
}


function handleCardMessages(messages, sender) {

	let elements = [];
	for (var m = 0; m < messages.length; m++) {
		let message = messages[m];
		let buttons = [];
		for (var b = 0; b < message.buttons.length; b++) {
			let isLink = (message.buttons[b].postback.substring(0, 4) === 'http');
			let button;
			if (isLink) {
				button = {
					"type": "web_url",
					"title": message.buttons[b].text,
					"url": message.buttons[b].postback
				}
			} else {
				button = {
					"type": "postback",
					"title": message.buttons[b].text,
					"payload": message.buttons[b].postback
				}
			}
			buttons.push(button);
		}


		let element = {
			"title": message.title,
			"image_url":message.imageUrl,
			"subtitle": message.subtitle,
			"buttons": buttons
		};
		elements.push(element);
	}
	sendGenericMessage(sender, elements);
}


function handleApiAiResponse(sender, response) {
	let responseText = response.result.fulfillment.speech;
	let responseData = response.result.fulfillment.data;
	let messages = response.result.fulfillment.messages;
	let action = response.result.action;
	let contexts = response.result.contexts;
	let parameters = response.result.parameters;

	sendTypingOff(sender);

	if (isDefined(messages) && (messages.length == 1 && messages[0].type != 0 || messages.length > 1) && action != "input.unknown"
	&& action != "enterEmail"){
		let timeoutInterval = 1100;
		let previousType ;
		let cardTypes = [];
		let timeout = 0;

		handleApiAiAction(sender, action, responseText, contexts, parameters);
		for (var i = 0; i < messages.length; i++) {

			if ( previousType == 1 && (messages[i].type != 1 || i == messages.length - 1)) {

				timeout = (i - 1) * timeoutInterval;
				setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
				cardTypes = [];
				timeout = i * timeoutInterval;
				setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
			} else if ( messages[i].type == 1 && i == messages.length - 1) {
				cardTypes.push(messages[i]);
                		timeout = (i - 1) * timeoutInterval;
                		setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
                		cardTypes = [];
			} else if ( messages[i].type == 1 ) {
				cardTypes.push(messages[i]);
			} else {
				timeout = i * timeoutInterval;
				setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
			}

			previousType = messages[i].type;

		}
	} else if (responseText == '' && !isDefined(action)) {
		//api ai could not evaluate input.
		console.log('Unknown query' + response.result.resolvedQuery);
		sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
	} else if (isDefined(action)) {
		console.log('this is the action' + action);
		handleApiAiAction(sender, action, responseText, contexts, parameters);
	} else if (isDefined(responseData) && isDefined(responseData.facebook)) {
		try {
			console.log('Response as formatted message' + responseData.facebook);
			sendTextMessage(sender, responseData.facebook);
		} catch (err) {
			sendTextMessage(sender, err.message);
		}
	} else if (isDefined(responseText)) {
		console.log("this is the responseText" + responseText);
		sendTextMessage(sender, responseText);
	}
}

function sendToApiAi(sender, text) {

	sendTypingOn(sender);
	let apiaiRequest = apiAiService.textRequest(text, {
		sessionId: sender
	});

	apiaiRequest.on('response', (response) => {
		if (isDefined(response.result)) {
			handleApiAiResponse(sender, response);
		}
	});

	apiaiRequest.on('error', (error) => console.error(error));
	apiaiRequest.end();
}




function sendTextMessage(recipientId, text) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text
		}
	}
	callSendAPI(messageData);
	console.log("SEND TEXT MESSAGE LOG");
	console.log(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "image",
				payload: {
					url: imageUrl
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "image",
				payload: {
					url: config.SERVER_URL + "/assets/instagram_logo.gif"
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "audio",
				payload: {
					url: config.SERVER_URL + "/assets/sample.mp3"
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "video",
				payload: {
					url: config.SERVER_URL + videoName
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "file",
				payload: {
					url: config.SERVER_URL + fileName
				}
			}
		}
	};

	callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "button",
					text: text,
					buttons: buttons
				}
			}
		}
	};

	callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "generic",
					elements: elements
				}
			}
		}
	};

	callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
							timestamp, elements, address, summary, adjustments) {
	// Generate a random receipt ID as the API requires a unique ID
	var receiptId = "order" + Math.floor(Math.random() * 1000);

	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "receipt",
					recipient_name: recipient_name,
					order_number: receiptId,
					currency: currency,
					payment_method: payment_method,
					timestamp: timestamp,
					elements: elements,
					address: address,
					summary: summary,
					adjustments: adjustments
				}
			}
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			text: text,
			metadata: isDefined(metadata)?metadata:'',
			quick_replies: replies
		}
	};

	callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "mark_seen"
	};

	callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_on"
	};

	callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


	var messageData = {
		recipient: {
			id: recipientId
		},
		sender_action: "typing_off"
	};

	callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
	var messageData = {
		recipient: {
			id: recipientId
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "button",
					text: "Welcome. Link your account.",
					buttons: [{
						type: "account_link",
						url: config.SERVER_URL + "/authorize"
          }]
				}
			}
		}
	};

	callSendAPI(messageData);
}
function consumerquickreply(sender, action, responseText, contexts, parameter){
var txtmessage = "";
request({
		uri: 'https://graph.facebook.com/v2.7/' + sender,
		qs: {
			access_token: config.FB_PAGE_TOKEN
		}

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {

			var user = JSON.parse(body);


			if (user.first_name) {
				console.log("FB user: %s %s, %s",
					user.first_name, user.last_name, user.gender);

				txtmessage = "Hi " + user.first_name + '! I\'m honestbee bot, your all-in-one personal concierge and delivery app. 🐝  To continue, are you a consumer, a merchant, or a rider?”';
				let replies = [
		{
			"content_type": "text",
			"title": "I'm a consumer",
			"payload":"I'm a consumer"
		},
		{
			"content_type": "text",
			"title": "I'm a merchant",
			"payload":"I'm a merchant"

		},
		{
			"content_type": "text",
			"title": "I'm a rider",
			"payload":"I'm a rider"

		}

		];
		sendQuickReply(sender, txtmessage, replies);
			} else {
				console.log("Cannot get data for fb user with id",
					sender);
			}
		} else {
			console.error(response.error);
		}

	});


}


function sendBackCard(button, element){

	sendGenericMessage(recipientID, elements)
}

function greetUserText(userId) {
	//first read user firstname
	request({
		uri: 'https://graph.facebook.com/v2.7/' + userId,
		qs: {
			access_token: config.FB_PAGE_TOKEN
		}

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {

			var user = JSON.parse(body);


			if (user.first_name) {
				console.log("FB user: %s %s, %s",
					user.first_name, user.last_name, user.gender);

				sendTextMessage(userId, "Hi " + user.first_name + '! I\'m honestbee bot, your one-stop platform for an easier, more productive life 🐝  To continue, are you an honestbee consumer or are you an honestbee merchant?');
			} else {
				console.log("Cannot get data for fb user with id",
					userId);
			}
		} else {
			console.error(response.error);
		}

	});
}



/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */

function callSendAPI(messageData) {
	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {
			access_token: config.FB_PAGE_TOKEN
		},
		method: 'POST',
		json: messageData

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;

			if (messageId) {
				console.log("Successfully sent message with id %s to recipient %s",
					messageId, recipientId);
			} else {
				console.log("Successfully called Send API for recipient %s",
					recipientId);
			}
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
		}
	});
}



/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */

function receivedPostback(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfPostback = event.timestamp;

	// The 'payload' param is a developer-defined field which is set in a postback
	// button for Structured Messages.
	var payload = event.postback.payload;


	switch (payload) {
		 case "getStarted":
		 sendToApiAi(senderID, "Get Started");

		 break;

		 case "Return_bot":
		 sendToApiAi(senderID, "Restart Bot");
		 break;

		 case 'mostfaq':
		 sendToApiAi(senderID, "Most Asked");
		 break;

		 case "feed_back":
		 sendToApiAi(senderID, "Feedback");
		 break;

		 case "Learn_More":
		 sendToApiAi(senderID, "Learn More");
		 break;

		 case "Referral_Program":
		 sendToApiAi(senderID, "Referral Program");
		 break;

		 case "About_Us":
		 sendToApiAi(senderID, "About Us");
		 break;

		 case "Getting_Started":
		 sendToApiAi(senderID, "Getting Started");
		 break;

		 case "Stores":
		 sendToApiAi(senderID, "Stores");
		 break;

		 case "Orders":
		 sendToApiAi(senderID, "back_toorders");
		 break;

		 case "Delivery":
		 sendToApiAi(senderID, "Delivery");
		 break;

		 case "Payments_and_Fees":
		 sendToApiAi(senderID, "Payments & Fees");
		 break;

		 case "Pricing":
		 sendToApiAi(senderID, "Pricing");
		 break;

		 case "Technical_Issues":
		 sendToApiAi(senderID, "Technical Issues");
		 break;

		 case "Customer_Care":
		 sendToApiAi(senderID, "Customer Care");
		//sendTextMessage(senderID, "responseText");//gawing message try mo
		 break;

		 case 'back_tomost':
		 sendToApiAi(senderID, "Most Asked");
		 break;

		 case "back_tolearnmore":
		 sendToApiAi(senderID, "Back to Learn More");
		 //sendToApiAi(senderID, "back_tolearnmore");
		 break;

		 case "back_todelivery":
		 sendToApiAi(senderID, "back_todelivery");
		 break;

		 case "back_tocustomer":
		 sendToApiAi(senderID, "back_tocustomer");
		 break;

		 case "back_totechnical":
		 sendToApiAi(senderID, "back_totechnical");
		 break;

		 case "back_togetstarted":
		 sendToApiAi(senderID, "back_togetstarted");
		 break;

		 case "back_topayments":
		 sendToApiAi(senderID, "back_topayments");
		 break;

		 case "back_toorders":
		 sendToApiAi(senderID, "back_toorders");
		 break;

		 case "back_topricing":
		 sendToApiAi(senderID, "back_topricing");
		 break;

		 case "back_toreferral":
		 sendToApiAi(senderID, "back_toreferral");
		 break;

		 case "back_consumer":
		 sendToApiAi(senderID, "back_consumer");
		 break;

		 case 'go_tofeedback':
		 sendToApiAi(senderID, "Yes");
		 break;

		 case "go_toappnow":
		 sendToApiAi(senderID, "Go to App Now");
		 break;

		 case "check_outstores":
		 sendToApiAi(senderID, "Check out stores");
		 break;

		 case "go_toappref":
		 sendToApiAi(senderID, "Go to App Now");
		 break;

		 case "consumer_choice":
		 sendToApiAi(senderID, "Consumer Choice");
		 break;

		 case "food":
		 sendToApiAi(senderID, "Food");
		 break;

		 case "food_partners":
		 sendToApiAi(senderID, "Food Partners");
		 break;

		 case "grocery":
		 sendToApiAi(senderID, "Grocery");
		 break;

		 case "serviceable_areas":
		 sendToApiAi(senderID, "Serviceable Areas");
		 break;

		 case "grocery_serviceable":
		 sendToApiAi(senderID, "Serviceable Areas");
		 break;

		 case "grocery_partners":
		 sendToApiAi(senderID, "Grocery Partners");
		 break;

		 case "back_consumerfood":
		 sendToApiAi(senderID, "Back_Food");
		 break;

		 case "back_consumergrocery":
		 sendToApiAi(senderID, "Back_Grocery");
		 break;

		 case "new_aboutus":
		 sendToApiAi(senderID, "About Us");
		 break;

		 case "new_serviceableareas":
		 sendToApiAi(senderID, "Serviceable Areas");
		 break;

		 case "new_key":
		 sendToApiAi(senderID, "Key");
		 break;

		 case "new_partner":
		 sendToApiAi(senderID, "Partner");
		 break;

		 case "new_contactus":
		 sendToApiAi(senderID, "Contact Us");
		 break;

		 case "back_newmerchant":
		 sendToApiAi(senderID, "New Merchant");
		 break;

		 case "back_merchant":
		 sendToApiAi(senderID, "Merchant");
		 break;

		 case "manual":
		 sendToApiAi(senderID, "Manual");
		 break;

		 case "tutorial":
		 sendToApiAi(senderID, "Tutorial");
		 break;

		 case "back_existingfood":
		 sendToApiAi(senderID, "Food");
		 break;

		 case "back_existinggrocery":
		 sendToApiAi(senderID, "Grocery");
		 break;

		 case "food_contactus":
		 sendToApiAi(senderID, "Contact Us");
		 break;

		 case "grocery_contactus":
		 sendToApiAi(senderID, "Contact Us");
		 break;

		 case "mostfaq":
		 sendToApiAi(senderID, "Most Asked");
		 break;

		case "customsg":
		sendToApiAi(senderID, "customsg");
		break;
		
		case "sendmsgs":
		sendToApiAi(senderID, "sendmsgs");
		break;


		default:
			//unindentified payload
			sendTextMessage(senderID, "Can you be more specific?");
			break;

	}

	console.log("Received postback for user %d and page %d with payload '%s' " +
		"at %d", senderID, recipientID, payload, timeOfPostback);

}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;

	// All messages before watermark (a timestamp) or sequence have been seen.
	var watermark = event.read.watermark;
	var sequenceNumber = event.read.seq;

	console.log("Received message read event for watermark %d and sequence " +
		"number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;

	var status = event.account_linking.status;
	var authCode = event.account_linking.authorization_code;

	console.log("Received account link event with for user %d with status %s " +
		"and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var delivery = event.delivery;
	var messageIDs = delivery.mids;
	var watermark = delivery.watermark;
	var sequenceNumber = delivery.seq;

	if (messageIDs) {
		messageIDs.forEach(function (messageID) {
			console.log("Received delivery confirmation for message ID: %s",
				messageID);
		});
	}

	console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfAuth = event.timestamp;

	// The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
	// The developer can set this to an arbitrary value to associate the
	// authentication callback with the 'Send to Messenger' click event. This is
	// a way to do account linking when the user clicks the 'Send to Messenger'
	// plugin.
	var passThroughParam = event.optin.ref;

	console.log("Received authentication for user %d and page %d with pass " +
		"through param '%s' at %d", senderID, recipientID, passThroughParam,
		timeOfAuth);

	// When an authentication is received, we'll send a message back to the sender
	// to let them know it was successful.
	sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
	var signature = req.headers["x-hub-signature"];

	if (!signature) {
		throw new Error('Couldn\'t validate the signature.');
	} else {
		var elements = signature.split('=');
		var method = elements[0];
		var signatureHash = elements[1];

		var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
			.update(buf)
			.digest('hex');

		if (signatureHash != expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

function sendEmail(subject, content, name) {

	var api_key = 'key-2cc6875066bce7da401337300237471d';
	var domain = 'sandboxb18d41951b2a4b58a7f2bcdc7a7048f8.mailgun.org';
	var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

	var data = {
	from: 'Feedback <postmaster@sandboxb18d41951b2a4b58a7f2bcdc7a7048f8.mailgun.org>',
	to: 'migz.delgallego@honestbee.com',
	cc: 'marlo.lucio@honestbee.com',
	subject: `Feedback from ${name}`,
	text: content
	};
//
	mailgun.messages().send(data, function (error, body) {
	console.log(body);
	if(!error){
		console.log("NO ERROR SENDING EMAIL!");
		}
	});
}

function sendEmailInquiry(subject, content, name) {

	var api_key = 'key-2cc6875066bce7da401337300237471d';
	var domain = 'sandboxb18d41951b2a4b58a7f2bcdc7a7048f8.mailgun.org';
	var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});

	var data = {
	from: 'Inquiries <postmaster@sandboxb18d41951b2a4b58a7f2bcdc7a7048f8.mailgun.org>',
	to: 'migz.delgallego@honestbee.com',
	cc: 'marlo.lucio@honestbee.com',
	subject: `Inquiry from ${name}`,
	text: content
	};

	mailgun.messages().send(data, function (error, body) {
	console.log(body);
	if(!error){
		console.log("NO ERROR SENDING EMAIL!");
		}
	});
}

function isDefined(obj) {
	if (typeof obj == 'undefined') {
		return false;
	}

	if (!obj) {
		return false;
	}

	return obj != null;
}


// Spin up the server
app.listen(app.get('port'), function () {
	console.log('running on port', app.get('port'));
});
