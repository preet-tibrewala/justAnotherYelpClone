const { GridFSBucket, MongoClient, ObjectId } = require('mongodb');
const sharp = require('sharp');
const amqp = require('amqplib');
const { queueName } = require('../rabbitmq');
const { connectToDb, getDb } = require('../mongodb');

const rabbitmqUrl = process.env.RABBITMQ_URL;

async function main() {
    try {
        await connectToDb();
        const connection = await amqp.connect(rabbitmqUrl);
        const channel = await connection.createChannel();
        await channel.assertQueue(queueName);

        channel.consume(queueName, async (msg) => {
            try {
                if (msg) {
                    const { photoID, filename } = JSON.parse(msg.content.toString());
                    const db = getDb();
                    const photosCollection = db.collection('photos');
                    console.log(photoID);

                    const photo = await photosCollection.findOne({ _id: new ObjectId(photoID) });
                    console.log(photo);
                    const bucket = new GridFSBucket(db, { bucketName: 'photos' });
                    console.log(bucket);

                    const downloadStream = bucket.openDownloadStream(photo.fileId);
                    const chunks = [];
                    downloadStream.on('data', chunk => chunks.push(chunk));
                    downloadStream.on('end', async () => {
                        console.log(`Downloaded ${filename} from GridFS.`);
                        const buffer = Buffer.concat(chunks);
                        console.log(`Buffer length: ${buffer.length}`);
                        const thumbnailBuffer = await sharp(buffer)
                            .resize(100, 100)
                            .toFormat('jpeg')
                            .toBuffer();
                        console.log(`Thumbnail buffer size: ${thumbnailBuffer.length}`);

                        const uploadStream = bucket.openUploadStream(`${filename}_thumbnail`);
                        let fileId;

                        uploadStream.on('error', (uploadError) => {
                            console.error("Upload Stream Error:", uploadError);
                        });

                        uploadStream.on('finish', async () => {
                            fileId = uploadStream.id;
                            console.log(`Thumbnail file ID: ${fileId}`);
                            const result = await photosCollection.updateOne(
                                { _id: new ObjectId(photoID) },
                                { $set: { thumbnailId: fileId, thumbnailUrl: `https://localhost:8000/media/thumbs/${fileId}` } }
                            );
                            console.log(`Update Result:`, result);
                            console.log(`Thumbnail for ${filename} generated and saved.`);
                        });

                        uploadStream.end(thumbnailBuffer);
                    });

                    downloadStream.on('error', (downloadError) => {
                        console.error("Download Stream Error:", downloadError);
                    });
                }
            } catch (err) {
                console.error(`Error processing message: ${err}`);
            } finally {
                channel.ack(msg); // Always acknowledge the message
            }
        }, { noAck: false }); // Manual acknowledgment
    } catch (err) {
        console.error(err);
    }
}

main();
