'use strict';
const express = require('express')
const http = require('http');
const io = require('socket.io');
const cors = require('cors');

const FETCH_INTERVAL = 5000;
const PORT = process.env.PORT || 4000;

const tickers = [
  {name: 'AAPL', id: 1}, // Apple
  {name: 'GOOGL', id: 2}, // Alphabet
  {name: 'MSFT', id: 3}, // Microsoft
  {name: 'AMZN', id: 4}, // Amazon
  {name: 'FB', id: 5}, // Facebook
  {name: 'TSLA', id: 6} // Tesla
];

let watchLists = [];
let activeWatchList = {};

function randomValue(min = 0, max = 1, precision = 0) {
  const random = Math.random() * (max - min) + min;
  return random.toFixed(precision);
}

function utcDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
}

function getQuotes(socket) {
  let tickersArray = [];

  if (Object.keys(activeWatchList).length !== 0) {
    activeWatchList.selectedTickers.forEach(id => {
      const ticker = tickers.find(ticker => ticker.id === id);
      if (ticker) {
        tickersArray.push(ticker);
      }
    });
  } else {
    tickersArray = tickers;
  }

  const quotes = tickersArray.map(ticker => ({
    ticker,
    exchange: 'NASDAQ',
    price: randomValue(100, 300, 2),
    change: randomValue(0, 200, 2),
    change_percent: randomValue(-1, 1, 2),
    dividend: randomValue(0, 1, 2),
    yield: randomValue(0, 2, 2),
    last_trade_time: utcDate(),
  }));

  socket.emit('ticker', quotes);
}

function trackTickers(socket, interval) {
  // run the first time immediately
  getQuotes(socket);
  socket.emit('init', { interval, watchLists });

  // every N seconds
  const timer = setInterval(function() {
    getQuotes(socket);
  }, interval);

  socket.on('disconnect', function() {
    clearInterval(timer);
  });

  return timer;
}

const app = express();
app.use(cors());
const server = http.createServer(app);

const socketServer = io(server, {
  cors: {
    origin: "*",
  }
});

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

socketServer.on('connection', (socket) => {
  let timer;
  socket.on('start', () => {
    timer = trackTickers(socket, FETCH_INTERVAL);
  });

  socket.on('change-uptime', data => {
    clearInterval(timer);
    timer = trackTickers(socket, data.uptime * 1000);
  });

  socket.on('create-watching-list', data => {
    watchLists.push(data);
    activeWatchList = data;
    socket.emit('init', { watchLists });
    clearInterval(timer);
    timer = trackTickers(socket, data.interval);
  });

  socket.on('select-watching-list', data => {
    clearInterval(timer);
    activeWatchList = watchLists.find(list => list.id === data.id);
    timer = trackTickers(socket, data.interval);
  });

  socket.on('select-all-tickers', data => {
    clearInterval(timer);
    activeWatchList = {};
    timer = trackTickers(socket, data.interval);
  });

  socket.on('delete-watching-list', data => {
    watchLists = watchLists.filter(list => list.id !== data.id);
    socket.emit('init', { watchLists });

    if (data.id === activeWatchList.id) {
      clearInterval(timer);
      activeWatchList = {};
      timer = trackTickers(socket, data.interval);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Streaming service is running on http://localhost:${PORT}`);
});
