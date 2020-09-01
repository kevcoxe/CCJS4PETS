const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const express = require('express');
const bodyParser = require('body-parser');
const { ApolloServer } = require('apollo-server-express');
const RedisServer = require('redis-server');
const redisClient = require('redis');
const { promisify } = require('util');
const openapi_to_graphql = require('openapi-to-graphql');

const PET_DATA = require('./src/data');

const APP_NAME = 'Charm City JS 4 Pets';
const EXPRESS_PORT = 8080;
const REDIS_PORT = 6379;
const MQTT_PORT = 1885;
const APOLLO_PORT = 5000;

const swaggerOptions = {
  swaggerDefinition: {
    info: {
      title: `${APP_NAME} API`,
      description: 'The API for the CCJS pet owners',
      contact: {
        name: 'Jamison Hyman',
      },
      version: '1.0.0',
    },
    openapi: '3.0.0',
    servers: [
      {
        url: `http://localhost:${EXPRESS_PORT}`,
      },
    ],
  },
  apis: ['swaggerDefinitions.js', 'app.js'],
};

class CCJS4PETS {

  async start() {
    const swaggerDocs = swaggerJsDoc(swaggerOptions);

    const app = express();
    app.use(bodyParser.json());

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

    const { schema } = await openapi_to_graphql.createGraphQLSchema(swaggerDocs);
    const apolloServer = new ApolloServer({ schema });

    apolloServer.applyMiddleware({ app });

    const redisServer = new RedisServer(REDIS_PORT);
    const redisError = await redisServer.open();

    if (redisError) {
      return console.error('error starting redis server');
    }

    const client = redisClient.createClient(REDIS_PORT, '127.0.0.1');
    const hmset = promisify(client.hmset).bind(client);
    const hgetall = promisify(client.hgetall).bind(client);

    const getPetsInRedis = async () => {
      const petsInRedis = await hgetall('pets');
      const pets = Object.keys(petsInRedis).map(id => JSON.parse(petsInRedis[id]));

      return pets;
    };

    // // // insert all pet types
    PET_DATA.forEach(pet => {
      hmset('pets', {
        [pet.id]: JSON.stringify(pet)
      });
    });
    
    // app.post('/addNewPet', async (req, res) => {
    //   const {
    //     petFirstName,
    //     petEmail,
    //     petLastName,
    //     petOwnerName,
    //     petUsername,
    //   } = req.body;
    //   // @ts-ignore
    //   const results = await hset('pets', petUsername, req.body);
    //   console.log('results', results);
    //   res.send(200);
    // });

    /**
     * @swagger
     * /pets:
     *   get:
     *     description: Return all available pets
     *     responses:
     *       '200':
     *          description: Use to request all pets
     *          content:
     *            application/json:
     *              schema:
     *                type: array
     *                description: The pet collection
     *                items:
     *                  $ref: '#/components/schemas/Pet'   
     */
    app.get('/pets', async (req, res) => {
      console.log('hit pet endpoint');
      try {
        const pets = await getPetsInRedis();
        res.send(pets);
      } catch (e) {
        res.send('error');
      }
    });

    /**
     * @swagger
     * /pet:
     *   get:
     *     operationId: findPetByName
     *     description: Find a pet by its name
     *     parameters:
     *       - $ref: "#/components/parameters/name"
     *     responses:
     *       '200':
     *          description: Use to request a pet by its name
     *          content:
     *            application/json:
     *              schema:
     *                $ref: '#/components/schemas/Pet'   
     */
    app.get('/pet', async(req, res) => {
      try {
        const pets = await getPetsInRedis();
        const myPet = pets.find(pet => pet.name.toLowerCase() === req.query.name.toLowerCase());
        console.log('myPet', myPet);
        res.send(myPet);
      } catch (e) {
        res.send('error');
      }
      // const pet = PET_DATA.find(pet => pet.name === req.params.petName);
      // res.send(pet);
    });

    process.on('exit', async () => {
      try {
        await server.close();
        redisClient.quit();
      } catch (err) {
        console.log(err);
        console.log('Error closing redis server');
      }
    });

    app.listen(EXPRESS_PORT);

    console.log(`\n${APP_NAME} listening on port ${EXPRESS_PORT}`);
    console.log(`GraphQL listening on path ${EXPRESS_PORT}/graphql`);
    console.log(`redis-server listening on ${REDIS_PORT}`);
  }
}

new CCJS4PETS().start();
