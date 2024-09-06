const amqp = require("amqplib")

//const rabbitmqHost = process.env.RABBITMQ_HOST
const rabbitmqUrl = process.env.RABBITMQ_URL
let _channel

const queueName = "photos"
exports.queueName = queueName

exports.connectToRabbitMQ = async function () {
  const connection = await amqp.connect(rabbitmqUrl)
  _channel = await connection.createChannel()
  await _channel.assertQueue(queueName)
}

exports.getChannel = function () {
  return _channel
}