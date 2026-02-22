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
    database: 'escola'
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

app.get('/cursos', async (req, res) => {
  try {

    // Obtenir les dades de la base de dades
    const cursosRows = await db.query(`
      SELECT
        c.id,
        c.nom,
        c.tematica,
        COALESCE(
          GROUP_CONCAT(DISTINCT m.nom ORDER BY m.nom SEPARATOR ', '),
          '—'
        ) AS mestre_nom
      FROM cursos c
      LEFT JOIN mestre_curs mc ON mc.curs_id = c.id
      LEFT JOIN mestres m ON m.id = mc.mestre_id
      GROUP BY c.id, c.nom, c.tematica
      ORDER BY c.id;
    `);

    // Transformar les dades a JSON (per les plantilles .hbs)
    const cursosJson = db.table_to_json(cursosRows, {
      id: 'number',
      nom: 'string',
      tematica: 'string',
      mestre_nom: 'string'
    });

    // Llegir l'arxiu .json amb dades comunes per a totes les pàgines
    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );

    // Construir l'objecte de dades per a la plantilla
    const data = {
      cursos: cursosJson,
      common: commonData
    };

    // Renderitzar la plantilla amb les dades
    res.render('cursos', data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades');
  }
});

// Start server
const httpServer = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`http://localhost:${port}/cursos`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  httpServer.close();
  process.exit(0);
});