const router = require('express').Router()
const { validateAgainstSchema, extractValidFields } = require('../lib/validation')

const { getDb } = require('../mongodb')
const { ObjectId } = require('mongodb')
const { generateAuthToken, requireAuthentication } = require('../lib/auth');

//const businesses = require('../data/businesses')
//const { reviews } = require('./reviews')
//const { photos } = require('./photos')

exports.router = router
//exports.businesses = businesses

/*
 * Schema describing required/optional fields of a business object.
 */
const businessSchema = {
  ownerid: { required: true },
  name: { required: true },
  address: { required: true },
  city: { required: true },
  state: { required: true },
  zip: { required: true },
  phone: { required: true },
  category: { required: true },
  subcategory: { required: true },
  website: { required: false },
  email: { required: false }
}

/*
 * Route to return a list of businesses.
 */
router.get('/', async function (req, res, next) {

  const db = getDb()
  

  try {
    /*
     * Compute page number based on optional query string parameter `page`.
     * Make sure page is within allowed bounds.
     */
    const collection = db.collection('businesses')
    let page = parseInt(req.query.page) || 1
    const numPerPage = 10
    const totalCount = await collection.countDocuments()
    const lastPage = Math.ceil(totalCount / numPerPage)
    page = page > lastPage ? lastPage : page
    page = page < 1 ? 1 : page

    /*
     * Calculate starting and ending indices of businesses on requested page and
     * slice out the corresponsing sub-array of busibesses.
     */
    const skip = (page - 1) * numPerPage

    const pageBusinesses = await collection.find().sort({_id: 1}).skip(skip).limit(numPerPage).toArray()

    /*
     * Generate HATEOAS links for surrounding pages.
     */
    const links = {}
    if (page < lastPage) {
      links.nextPage = `/businesses?page=${page + 1}`
      links.lastPage = `/businesses?page=${lastPage}`
    }
    if (page > 1) {
      links.prevPage = `/businesses?page=${page - 1}`
      links.firstPage = '/businesses?page=1'
    }

    /*
     * Construct and send response.
     */
    res.status(200).send({
      businesses: pageBusinesses,
      pageNumber: page,
      totalPages: lastPage,
      pageSize: numPerPage,
      totalCount: totalCount,
      links: links
    })
  } catch (err) {
    next(err)
  }
})

/*
 * Route to create a new business.
 */
router.post('/', requireAuthentication, async function (req, res, next) {
  console.log(req.user)
  if(!(req.user.admin || req.user.userId === req.body.ownerid)){
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{

    const db = getDb();

  if (validateAgainstSchema(req.body, businessSchema)) {
    try {
      const business = extractValidFields(req.body, businessSchema);
      business.ownerid = new ObjectId(business.ownerid);

      const collection = db.collection('businesses');
      const result = await collection.insertOne(business);
      res.status(201).send({
        id: result.insertedId
      });
    } catch (err) {
      next(err);
    }
  } else {
    res.status(400).send({
      error: "Request body is not a valid business object"
    });
  }
  }
});

/*
 * Route to fetch info about a specific business.
 */
router.get('/:businessid', async function (req, res, next) {
  const db = getDb();
  const businessesCollection = db.collection('businesses');

  const businessid = new ObjectId(req.params.businessid);

  try {
    const businessData = await businessesCollection.aggregate([
      { $match: { _id: businessid } },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'businessid',
          as: 'reviews'
        }
      },
      {
        $lookup: {
          from: 'photos',
          localField: '_id',
          foreignField: 'businessid',
          as: 'photos'
        }
      }
    ]).toArray();

    if (businessData.length > 0) {
      res.status(200).send(businessData[0]);
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

/*
 * Route to replace data for a business.
 */
router.put('/:businessid', requireAuthentication, async function (req, res, next) {
  console.log(req.user)
  if(!(req.user.admin || req.user.userId === req.body.ownerid)){
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{
    const db = getDb();
    const businessesCollection = db.collection('businesses');

    const businessid = new ObjectId(req.params.businessid);

    if (validateAgainstSchema(req.body, businessSchema)) {
      const business = extractValidFields(req.body, businessSchema);
      business.ownerid = new ObjectId(business.ownerid);

      try {
        const result = await businessesCollection.replaceOne({ _id: businessid }, business);

        if (result.matchedCount > 0) {
          res.status(200).send({
            links: {
              business: `/businesses/${businessid}`
            }
          });
        } else {
          next();
        }
      } catch (err) {
        next(err);
      }
    } else {
      res.status(400).send({
        error: "Request body is not a valid business object"
      });
    }
  }
  
});

/*
 * Route to delete a business.
 */
router.delete('/:businessid', requireAuthentication, async function (req, res, next) {
  console.log(req.user)
  try {
    const db = getDb();
    const businessesCollection = db.collection('businesses');
    const reviewsCollection = db.collection('reviews');
    const photosCollection = db.collection('photos');
    
    const businessid = new ObjectId(req.params.businessid);
    
    // Fetch the business entry to check ownerid
    const business = await businessesCollection.findOne({ _id: businessid });
    if (!business) {
      return res.status(404).send({ error: "Business not found" });
    }
    
    // Compare ownerid with the userId from JWT token
    
    if (!(req.user.admin || business.ownerid.toString() === req.user.userId)) {
      return res.status(403).send({
        error: "Unauthorized to access the specified resource"
      });
    }

    // Proceed with deletion
    const result = await businessesCollection.deleteOne({ _id: businessid });
    const reviewsDeleteResult = await reviewsCollection.deleteMany({ businessid: businessid });
    const photosDeleteResult = await photosCollection.deleteMany({ businessid: businessid });

    if (result.deletedCount > 0 || reviewsDeleteResult.deletedCount > 0 || photosDeleteResult.deletedCount > 0) {
      res.status(204).end();
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});
