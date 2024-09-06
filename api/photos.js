const router = require('express').Router()
const express = require('express');
const { validateAgainstSchema, extractValidFields } = require('../lib/validation')
const { generateAuthToken, requireAuthentication } = require('../lib/auth');
const { getDb } = require('../mongodb')
const { ObjectId } = require('mongodb')
const multer = require('multer')
const crypto = require('node:crypto');
const e = require('express');
const { error } = require('node:console');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const path = require('path');
const { connectToRabbitMQ, getChannel, queueName } = require('../rabbitmq');
const { get } = require('node:http');
const imageTypes = {
  "image/jpeg": "jpg", 
  "image/png": "png"}

  

const photoSchema = {
  userid: { required: true },
  businessid: { required: true },
  caption: { required: false }
}


exports.router = router
//exports.photos = photos

/*
 * Schema describing required/optional fields of a photo object.
 */
const storage = multer.memoryStorage()

const fileFilter = (req, file, callback) => {
  if (imageTypes[file.mimetype]) {
    callback(null, true)
  } else {
    callback(new error('File type not supported'), false)
  }
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter
})

function uploadToGridFS(buffer, filename, mimetype, bucket) {
  return new Promise((resolve, reject) => {
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimetype
    });

    readableStream.pipe(uploadStream)
      .on('error', (error) => reject(error))
      .on('finish', () => resolve(uploadStream.id));
  });
}

router.post('/', requireAuthentication, upload.single('image'), async function (req, res, next) {
  console.log(req.user);
  
  if (!(req.user.admin || req.user.userId === req.body.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{

    const db = getDb()
    const photosCollection = db.collection('photos')
    const bucket = new GridFSBucket(db, {
      bucketName: 'photos'
    });

    if (validateAgainstSchema(req.body, photoSchema)) {
      let photo = extractValidFields(req.body, photoSchema)
      photo.userid = new ObjectId(String(photo.userid))
      photo.businessid = new ObjectId(String(photo.businessid))

      try {
        const fileId = await uploadToGridFS(req.file.buffer, req.file.originalname, req.file.mimetype, bucket);
        photo.fileId = fileId
        photo.filename = req.file.originalname
        photo.contentType = req.file.mimetype
        const result = await photosCollection.insertOne(photo)

        if (result.insertedId) {
          const channel = getChannel();
          const queue = queueName;
          const msg = JSON.stringify({ photoID: result.insertedId.toString(), filename: photo.filename });
          channel.assertQueue(queue, { durable: true });
          channel.sendToQueue(queue, Buffer.from(msg));

          res.status(201).send({
            id: result.insertedId,
            links: {
              photo: `/photos/${result.insertedId}`
            }
          })
        } else {
          next()
        }
      } catch (err) {
        console.error("  -- error:", err)
        next(err)
      }

    } else {
      res.status(400).send({
        error: "Request body is not a valid photo object"
      })
    }

  }
  
})

router.get('/:photoID', async function (req, res, next) {
  const db = getDb()
  const photosCollection = db.collection('photos')

  const photoID = new ObjectId(req.params.photoID)

  try {
    const photo = await photosCollection.findOne({ _id: photoID })


    if (photo) {
      photo.imageUrl = `https://localhost:8000/media/photos/${photoID}`;
      res.status(200).send(photo)
    } else {
      next()
    }
  } catch (err) {
    next(err)
  }
})
/*
router.get('/:photoID/download', async function (req, res, next) {
  const db = getDb();
  const photosCollection = db.collection('photos');
  const bucket = new GridFSBucket(db, { bucketName: 'photos' });
  const photoID = new ObjectId(req.params.photoID);

  try {
    const photo = await photosCollection.findOne({ _id: photoID });

    if (photo) {
      const downloadStream = bucket.openDownloadStream(photo.fileId);

      downloadStream.on('file', (file) => {
        res.set('Content-Type', file.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
      });

      downloadStream.on('error', (err) => {
        console.error("  -- error:", err);
        res.status(404).send('File not found');
      });

      downloadStream.on('end', () => {
        res.end();
      });

      downloadStream.pipe(res);
    } else {
      res.status(404).send('Photo not found');
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:photoID/thumbnail', async function (req, res, next) {
  const db = getDb();
  const bucket = new GridFSBucket(db, { bucketName: 'photos' });
  const photoID = new ObjectId(req.params.photoID);

  try {
    // Try to open a download stream using the photoID as the fileId
    const downloadStream = bucket.openDownloadStream(photoID);

    downloadStream.on('file', (file) => {
      res.set('Content-Type', file.contentType || 'image/jpeg');
      res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    });

    downloadStream.on('error', (err) => {
      console.error("  -- error:", err);
      res.status(404).send('File not found');
    });

    downloadStream.on('end', () => {
      res.end();
    });

    downloadStream.pipe(res);
  } catch (err) {
    next(err);
  }
})*/



/*
 * Route to update a photo.
 */
router.put('/:photoID', requireAuthentication, async function (req, res, next) {
  console.log(req.user);
  if (!(req.user.admin || req.user.userId === req.body.userid)) {
    return res.status(403).send({
      error: "Unauthorized to access the specified resource"
    });
  }

  const db = getDb();
  const photosCollection = db.collection('photos');

  const photoID = new ObjectId(req.params.photoID);

  if (validateAgainstSchema(req.body, photoSchema)) {
    let updatedPhoto = extractValidFields(req.body, photoSchema);
    updatedPhoto.businessid = new ObjectId(String(updatedPhoto.businessid));
    updatedPhoto.userid = new ObjectId(String(updatedPhoto.userid));
    
    try {
      const existingPhoto = await photosCollection.findOne({ _id: photoID });

      if (existingPhoto && updatedPhoto.businessid.equals(existingPhoto.businessid) && updatedPhoto.userid.equals(existingPhoto.userid)) {
        const result = await photosCollection.replaceOne({ _id: photoID }, updatedPhoto);

        if (result.matchedCount > 0) {
          res.status(200).send({
            links: {
              photo: `/photos/${photoID}`,
              business: `/businesses/${updatedPhoto.businessid}`
            }
          });
        } else {
          next();
        }
      } else {
        res.status(403).send({
          error: "Updated photo cannot modify businessid or userid"
        });
      }
    } catch (err) {
      next(err);
    }
  } else {
    res.status(400).send({
      error: "Request body is not a valid photo object"
    });
  }
});

/*
 * Route to delete a photo.
 */
router.delete('/:photoID', requireAuthentication, async function (req, res, next) {
  console.log(req.user);
  const db = getDb();
  const photosCollection = db.collection('photos');

  const photoID = new ObjectId(req.params.photoID);

  try {
    // Fetch the photo to check the owner
    const photo = await photosCollection.findOne({ _id: photoID });

    if (!photo) {
      return res.status(404).send({ error: "Photo not found" });
    }

    // Check if the user making the request is the owner of the photo
    
    if (!(req.user.admin || photo.userid.toString() === req.user.userId)) {
      return res.status(403).send({
        error: "Unauthorized to access the specified resource"
      });
    }

    // Proceed with deletion if the user is authorized
    const result = await photosCollection.deleteOne({ _id: photoID });

    if (result.deletedCount > 0) {
      res.status(204).end();
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

