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

exports.router = router

router.get('/photos/:photoID', async function (req, res, next) {
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
  
  router.get('/thumbs/:photoID', async function (req, res, next) {
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
  })