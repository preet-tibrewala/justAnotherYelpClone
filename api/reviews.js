const router = require('express').Router()
const { validateAgainstSchema, extractValidFields } = require('../lib/validation')

const { getDb } = require('../mongodb')
const { ObjectId } = require('mongodb')
const { generateAuthToken, requireAuthentication } = require('../lib/auth');

//const reviews = require('../data/reviews')

exports.router = router
//exports.reviews = reviews

/*
 * Schema describing required/optional fields of a review object.
 */
const reviewSchema = {
  userid: { required: true },
  businessid: { required: true },
  dollars: { required: true },
  stars: { required: true },
  review: { required: false }
}


/*
 * Route to create a new review.
 */
router.post('/', requireAuthentication, async function (req, res, next) {

  console.log(req.user)
  
  if (!(req.user.admin || req.user.userId === req.body.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }
  
  else{

    const db = getDb()
    const collection = db.collection('reviews')

    if (validateAgainstSchema(req.body, reviewSchema)) {
      const review = extractValidFields(req.body, reviewSchema)

      try {
        /*
         * Make sure the user is not trying to review the same business twice.
         */
        const existingReview = await collection.findOne({
          ownerid: review.ownerid,
          businessid: new ObjectId(String(review.businessid))
        })

        if (existingReview) {
          res.status(403).send({
            error: "User has already posted a review of this business"
          })
        } else {
          const result = await collection.insertOne({
            ...req.body,
            userid: new ObjectId(String(req.body.userid)),
            businessid: new ObjectId(String(req.body.businessid)),
          })
          res.status(201).send({
            id: result.insertedId,
          })
        }
      } catch (err) {
        next(err)
      }

    } else {
      res.status(400).send({
        error: "Request body is not a valid review object"
      })
    }

  }

  
})

/*
 * Route to fetch info about a specific review.
 */

router.get('/:reviewID', async function (req, res, next) {
  const db = getDb()
  const reviewsCollection = db.collection('reviews')

  const reviewID = new ObjectId(req.params.reviewID)

  try {
    const review = await reviewsCollection.findOne({ _id: reviewID })

    if (review) {
      res.status(200).send(review)
    } else {
      next()
    }
  } catch (err) {
    next(err)
  }
})

/*
 * Route to update a review.
 */
router.put('/:reviewID', requireAuthentication, async function (req, res, next) {
  
  if (!(req.user.admin || req.user.userId === req.body.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{

    const db = getDb()
    const reviewsCollection = db.collection('reviews')

    const reviewID = new ObjectId(req.params.reviewID)

    if (validateAgainstSchema(req.body, reviewSchema)) {
      let updatedReview = extractValidFields(req.body, reviewSchema)
      updatedReview.businessid = new ObjectId(String(updatedReview.businessid))
      updatedReview.userid = new ObjectId(String(updatedReview.userid))

      try {
        const existingReview = await reviewsCollection.findOne({ _id: reviewID })

        if (existingReview && updatedReview.businessid.equals(existingReview.businessid) && updatedReview.userid.equals(existingReview.userid)) {
          const result = await reviewsCollection.replaceOne({ _id: reviewID }, updatedReview)

          if (result.matchedCount > 0) {
            res.status(200).send({
              links: {
                review: `/reviews/${reviewID}`
              }
            })
          } else {
            next()
          }
        } else {
          res.status(403).send({
            error: "Updated review cannot modify businessid or userid"
          })
        }
      } catch (err) {
        next(err)
      }

    } else {
      res.status(400).send({
        error: "Request body is not a valid review object"
      })
    }

  }
 
  
})
/*
 * Route to delete a review.
 */
router.delete('/:reviewID', requireAuthentication, async function (req, res, next) {
  console.log(req.user)
  const db = getDb();
  const reviewsCollection = db.collection('reviews');

  const reviewID = new ObjectId(req.params.reviewID);

  try {
    // Fetch the review to check the owner
    const review = await reviewsCollection.findOne({ _id: reviewID });

    if (!review) {
      return res.status(404).send({ error: "Review not found" });
    }

    // Check if the user making the request is the owner of the review
    if (!(req.user.admin || review.userid.toString() === req.user.userId)) {
      return res.status(403).send({
        error: "Unauthorized to access the specified resource"
      });
    }

    // Proceed with deletion if the user is authorized
    const result = await reviewsCollection.deleteOne({ _id: reviewID });

    if (result.deletedCount > 0) {
      res.status(204).end();
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});
