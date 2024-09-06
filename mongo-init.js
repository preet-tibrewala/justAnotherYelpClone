db = db.getSiblingDB('admin');
db.auth('root', 'hunter2');

db = db.getSiblingDB('yelp-clone');
db.createUser({
    user: 'yelpuser',
    pwd: 'password',
    roles: [
      {
        role: 'readWrite',
        db: 'yelp-clone'
      }
    ]
});