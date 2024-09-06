const router = require('express').Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
const { generateAuthToken, requireAuthentication } = require('../lib/auth');

const JWT_SECRET = 'thisisasecret';
const JWT_EXPIRATION = '24h';

exports.router = router
const { ObjectId } = require('mongodb');
const { getDb } = require('../mongodb');
const e = require('express');

const userSchema = {
  name: { required: true },
  email: { required: true },
  password: { required: true },
  admin: { required: false, default: false }
}

/*
 * Route to add a user.

 */

const checkAdminCreation = (req, res, next) => {
  if (req.body.admin) {
    return requireAuthentication(req, res, next);
  }
  next();
};

router.post('/', checkAdminCreation, async function(req, res, next) {
  const { name, email, password, admin = false } = req.body;
  const { user } = req;

  if (admin) {
    if (!user || !user.admin) {
      return res.status(403).send({
        error: "Unauthorized to create an admin user."
      });
    }
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const db = getDb();
    const usersCollection = db.collection('users');

    const result = await usersCollection.insertOne({ name, email, password: hashedPassword, admin });

    res.status(201).send({ userId: result.insertedId });
  } catch (err) {
    next(err);
  }
});



/*
  * Route to get a user.
*/
router.get('/:userid', requireAuthentication, async function(req, res, next) {
  console.log(req.user)
  
  if(!(req.user.admin || req.user.userId === req.params.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{
    const db = getDb();
  const usersCollection = db.collection('users');
  //const userid = parseInt(req.params.userid);
  const newUserId = new ObjectId(req.params.userid)

  try {
    const user = await usersCollection.findOne({ _id: newUserId }, { projection: { password: 0 } })
    //const user = await usersCollection.findOne({ _id: newUserId }).project({ password: 0 })
    res.status(200).send(user)

  } catch (err) {
    next(err)
  }
  }  
})


/*
 * Route to list all of a user's businesses.
 */
router.get('/:userid/businesses', requireAuthentication, async function (req, res, next) {

  console.log(req.user)
  if(!(req.user.admin || req.user.userId === req.params.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{
    const db = getDb()
    const businessesCollection = db.collection('businesses')
    const userid = new ObjectId(req.params.userid)
    try {
      const userBusinesses = await businessesCollection.find({ ownerid: userid }).toArray()

      res.status(200).send({
        businesses: userBusinesses
      })
    } catch (err) {
      next(err)
    }

  }  
})

/*
 * Route to list all of a user's reviews.
 */
router.get('/:userid/reviews', requireAuthentication, async function (req, res) {
  
  console.log(req.user)
  if(!(req.user.admin || req.user.userId === req.params.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{

    const db = getDb()
    const reviewsCollection = db.collection('reviews')
    const userid = new ObjectId(req.params.userid)
    try {
      const userReviews = await reviewsCollection.find({ userid: userid }).toArray()

      res.status(200).send({
        reviews: userReviews
      })
    } catch (err) {
      next(err)
    }
  }
})

/*
 * Route to list all of a user's photos.
 */
router.get('/:userid/photos', requireAuthentication, async function (req, res) {
  
  console.log(req.user)
  if(!(req.user.admin || req.user.userId === req.params.userid)) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    })
  }else{


    const db = getDb()
    const photosCollection = db.collection('photos')
    const userid = new ObjectId(req.params.userid)

    try {
      const userPhotos = await photosCollection.find({ userid: userid }).toArray()


      res.status(200).send({
        photos: userPhotos
      })
    } catch (err) {
      next(err)
    }

  }
  
})

/* Login route */

router.post('/login', async function(req, res, next) {
  const { email, password } = req.body;

  try {
    const db = getDb();
    const usersCollection = db.collection('users');
    
    // Find the user by email
    const user = await usersCollection.findOne({ email: email });
    
    if (!user) {
      // If the user is not found, return a 401 error
      return res.status(401).send({ error: 'Invalid email or password' });
    }

    // Compare the provided password with the stored hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      // If the password is incorrect, return a 401 error
      return res.status(401).send({ error: 'Invalid email or password' });
    }

    // Generate a JWT token using the generateAuthToken function
    const token = generateAuthToken({
      userId: user._id,
      name: user.name,
      email: user.email,
      admin: user.admin
    });

    // Respond with the JWT token
    res.status(200).send({ token: token });
  } catch (err) {
    next(err);
  }
});