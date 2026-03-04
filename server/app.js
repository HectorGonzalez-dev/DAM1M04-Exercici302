const express = require('express');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const MySQL = require('./utilsMySQL');

const app = express();
const port = 3000;

// Detectar si estem al Proxmox (si és pm2)
const isProxmox = !!process.env.PM2_HOME;

// Iniciar connexió MySQL
const db = new MySQL();
if (!isProxmox) {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'alumnat',
    database: 'sakila'
  });
} else {
  db.init({
    host: '127.0.0.1',
    port: 3306,
    user: 'super',
    password: '1234',
    database: 'sakila'
  });
}

// Static files - ONLY ONCE
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

// Disable cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Handlebars
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Registrar "Helpers .hbs" aquí
hbs.registerHelper('eq', (a, b) => a == b);
hbs.registerHelper('gt', (a, b) => a > b);

// Partials de Handlebars
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

// Route
app.get('/', async (req, res) => {
  try {
    // Obtenir les dades de la base de dades
    const categoryRows = await db.query('SELECT category_id, name FROM category ORDER BY category_id LIMIT 5');
    const filmRows = await db.query('SELECT film_id, title, release_year FROM film ORDER BY film_id LIMIT 5');
    const actorRows = await db.query(`
      SELECT a.actor_id, a.first_name, a.last_name, fa.film_id
      FROM actor a
      JOIN film_actor fa ON fa.actor_id = a.actor_id
      JOIN (
          SELECT film_id
          FROM film
          ORDER BY film_id
          LIMIT 5
      ) f ON f.film_id = fa.film_id
    `);

    // Transformar les dades a JSON (per les plantilles .hbs)
    // Cal informar de les columnes i els seus tipus
    const categoryJson = db.table_to_json(categoryRows, { category_id: 'number', name: 'string' });
    const filmJson = db.table_to_json(filmRows, { film_id: 'number', title: 'string', release_year: 'number' });
    const actorJson = db.table_to_json(actorRows, { actor_id: 'number', first_name: 'string', last_name: 'string', film_id: 'number' });

    // Asociar actores a cada película
    const filmsWithActors = filmJson.map(film => {
      const actorsForFilm = actorJson
        .filter(actor => actor.film_id === film.film_id)
        .map(actor => ({ actor_id: actor.actor_id, first_name: actor.first_name, last_name: actor.last_name }));
      return { ...film, actors: actorsForFilm };
    });

    // Llegir l'arxiu .json amb dades comunes per a totes les pàgines
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    // Construir l'objecte de dades per a la plantilla
    const data = {
      category: categoryJson,
      film: filmsWithActors,
      common: commonData
    };

    // Renderitzar la plantilla amb les dades
    res.render('index', {
        ...data,
        currentPage: 'home'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

app.get('/movies', async (req, res) => {
  try {
    // Obtenir les dades de la base de dades
    const filmRows = await db.query('SELECT f.film_id, f.title, f.description, f.release_year, f.length, f.rating, l.name FROM film f JOIN language l ON f.language_id = l.language_id ORDER BY film_id LIMIT 15');
    const actorRows = await db.query(`
      SELECT a.actor_id, a.first_name, a.last_name, fa.film_id
      FROM actor a
      JOIN film_actor fa ON fa.actor_id = a.actor_id
      JOIN (
          SELECT film_id
          FROM film
          ORDER BY film_id
          LIMIT 15
      ) f ON f.film_id = fa.film_id
    `);

    // Transformar les dades a JSON (per les plantilles .hbs)
    // Cal informar de les columnes i els seus tipus
    const filmJson = db.table_to_json(filmRows, { film_id: 'number', title: 'string', description: 'string', release_year: 'number', length: 'number', rating: 'string', name: 'string' });
    const actorJson = db.table_to_json(actorRows, { actor_id: 'number', first_name: 'string', last_name: 'string', film_id: 'number' });

    // Asociar actores a cada película
    const filmsWithActors = filmJson.map(film => {
      const actorsForFilm = actorJson
        .filter(actor => actor.film_id === film.film_id)
        .map(actor => ({ actor_id: actor.actor_id, first_name: actor.first_name, last_name: actor.last_name }));
      return { ...film, actors: actorsForFilm };
    });

    // Llegir l'arxiu .json amb dades comunes per a totes les pàgines
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    // Construir l'objecte de dades per a la plantilla
    const data = {
      film: filmsWithActors,
      common: commonData
    };

    // Renderitzar la plantilla amb les dades
    res.render('movies', {
        ...data,
        currentPage: 'movies'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

app.get('/customers', async (req, res) => {
  try {
    // Obtenir les dades de la base de dades
    const customerRows = await db.query('SELECT customer_id, first_name, last_name, email FROM customer ORDER BY customer_id LIMIT 25');
    const rentalRows = await db.query(`
      SELECT c.customer_id,
            f.title,
            r.rental_date,
            r.return_date
      FROM (
          SELECT customer_id
          FROM customer
          ORDER BY customer_id
          LIMIT 25
      ) AS c
      JOIN rental r 
          ON r.customer_id = c.customer_id
      JOIN inventory i 
          ON r.inventory_id = i.inventory_id
      JOIN film f 
          ON i.film_id = f.film_id
      WHERE (
          SELECT COUNT(*)
          FROM rental r2
          WHERE r2.customer_id = r.customer_id
            AND r2.rental_date <= r.rental_date
      ) <= 5
      ORDER BY c.customer_id, r.rental_date
    `);

    // Transformar les dades a JSON (per les plantilles .hbs)
    // Cal informar de les columnes i els seus tipus
    const customerJson = db.table_to_json(customerRows, { customer_id: 'number', first_name: 'string', last_name: 'string', email: 'string'});
    const rentalJson = db.table_to_json(rentalRows, { customer_id: 'number', title: 'string', rental_date: 'date', return_date: 'date' });

    // Asociar alquileres a cada cliente
    const customersWithRentals = customerJson.map(customer => {
      const rentalsForCustomer = rentalJson
        .filter(rental => rental.customer_id === customer.customer_id)
        .map(rental => ({
          title: rental.title,
          rental_date: rental.rental_date,
          return_date: rental.return_date
        }));

      return { ...customer, rentals: rentalsForCustomer };
    });

    // Llegir l'arxiu .json amb dades comunes per a totes les pàgines
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    // Construir l'objecte de dades per a la plantilla
    const data = {
      customer: customersWithRentals,
      common: commonData
    };

    // Renderitzar la plantilla amb les dades
    res.render('customers', {
        ...data,
        currentPage: 'customers'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Start server
const httpServer = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`http://localhost:${port}/movies`);
  console.log(`http://localhost:${port}/customers`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  httpServer.close();
  process.exit(0);
});