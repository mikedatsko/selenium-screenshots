var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var http = require('http');
var resemble = require('resemblejs');
var axios = require('axios');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.get('/screenshot-browsers', function(req, res, next) {
  axios({
    method: 'get',
    url: 'https://www.browserstack.com/screenshots/browsers.json',
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  }).then(result => {
    // console.log('result', result);
    res.send(result.data);
  }).catch(err => res.status(400).send(err.stack));
});

app.get('/screenshot', function(req, res, next) {
  const browser = 'chrome';
  const width = 1280;
  const height = 1024;
  const browserWebDriver = require(`selenium-webdriver/${browser}`);
  // const firefox = require('selenium-webdriver/firefox');
  const {Builder, By, Key, until} = require('selenium-webdriver');
  const fs = require('fs');

  const screen = {
    width: width,
    height: height
  };

  let driver = new Builder()
    .forBrowser(browser)
    .setChromeOptions(new browserWebDriver.Options().headless().windowSize(screen))
    // .setFirefoxOptions(new firefox.Options().headless().windowSize(screen))
    .build();

  driver.get('http://twitter.com');

  // driver.wait(until.elementLocated(By.css('#doc')), 5000);

  setTimeout(() => {
    driver.takeScreenshot()
      .then(function (base64Image) {
        const decodedImage = new Buffer(base64Image, 'base64');
        fs.writeFile(`${browser}-${width}x${height}-${Date.now()}.png`, decodedImage, function(err) {
          console.log('took screenshot');
          res.send('ok');
        });
      });

    driver.quit();
  }, 5000);
});

app.get('/step', async function(req, res, next) {
  const browser = 'chrome';
  const browserWebDriver = require(`selenium-webdriver/${browser}`);
  // const firefox = require('selenium-webdriver/firefox');
  const {Builder, By, Key, until} = require('selenium-webdriver');
  const fs = require('fs');

  const cause = {
    page: '/settings'
  };
  const testRun = {
    protocol: 'https',
    domain: 'google.com',
    webAuth: {
      page: '/login',
      login: {
        cssPath: '#email',
        value: 'example@email.com'
      },
      password: {
        cssPath: '#password',
        value: '12345678'
      },
      submit: {
        type: 'click',
        cssPath: '.form-sign-in [type="submit"]'
      }
    },
    basicAuth: {
      login: 'basic',
      password: 'auth'
    },
    screen: {
      width: 1280,
      height: 1024
    },
    defaultTimeout: 1000
  };

  const waitFunction = async (timeout) => {
    timeout = timeout || (testRun && testRun.defaultTimeout) || 1000;

    try {
      const element = By.id('never-displayed-element');
      await driver.wait(until.elementLocated(element), timeout);
    } catch(err) {

    }
  };

  let driver = new Builder()
    .forBrowser(browser)
    .setChromeOptions(new browserWebDriver.Options().headless().windowSize(testRun.screen))
    // .setFirefoxOptions(new firefox.Options().headless().windowSize(screen))
    .build();

  console.log('start basicAuth ', Date.now());

  if (testRun.basicAuth) {
    const basicAuthUrl = `${testRun.protocol}://${testRun.basicAuth.login}:${testRun.basicAuth.password}@${testRun.domain}`;
    await driver.get(basicAuthUrl);
  }

  console.log('start webAuth   ', Date.now());

  if (testRun.webAuth) {

    const webAuthUrl = `${testRun.protocol}://${testRun.domain}${testRun.webAuth.page}`;
    await driver.navigate().to(webAuthUrl);

    await waitFunction();

    const loginEl = await driver.findElement(By.css(testRun.webAuth.login.cssPath));
    await loginEl.sendKeys(testRun.webAuth.login.value);

    const passwordEl = await driver.findElement(By.css(testRun.webAuth.password.cssPath));
    await passwordEl.sendKeys(testRun.webAuth.password.value);

    await waitFunction();

    const submitEl = await driver.findElement(By.css(testRun.webAuth.submit.cssPath));
    await submitEl.click();
  }

  await waitFunction();

  console.log('finish webAuth  ', Date.now());

  const causeUrl = `${testRun.protocol}://${testRun.domain}${cause.page}`;

  console.log('causeUrl', causeUrl);

  await driver.navigate().to(causeUrl);

  setTimeout(async () => {
    console.log('start screenshot', Date.now());

    // await driver.executeScript('document.querySelector(\'#email\').setAttribute(\'value\', \'new value for element\')');
    driver.takeScreenshot()
      .then(function (base64Image) {
        const decodedImage = new Buffer(base64Image, 'base64');
        const screenshotImage = `${browser}-${testRun.screen.width}x${testRun.screen.height}-${Date.now()}.png`;

        const file1 = './chrome-1280x1024-1525625427311.png';
        const diff = resemble(file1)
          .compareTo(decodedImage)
          .ignoreColors()
          .onComplete(function(data){
            console.log(data);

            if (data.error) {
              return res.send({
                error: data.error
              });
            }

            const compareImage = `compare-${Date.now()}.png`;

            fs.writeFile(compareImage, data.getBuffer(), function(err) {
              res.send({
                similarity: Math.round(100 - data.rawMisMatchPercentage),
                screenshotImage,
                compareImage
              });

              fs.writeFile(screenshotImage, decodedImage, function(err) {});
            });
            /*
            {
              misMatchPercentage : 100, // %
              isSameDimensions: true, // or false
              dimensionDifference: { width: 0, height: -1 }, // defined if dimensions are not the same
              getImageDataUrl: function(){}
            }
            */
          });
      });

    driver.quit();
  }, 2000);
});

app.get('/compare', function(req, res, next) {
  const fs = require('fs');
  const file1 = './chrome-1280x1024-1525625427311.png';
  // const file1 = './chrome-1280x1024-1525624045589.png';
  const file2 = './chrome-1280x1024-1525625427311.png';
  const diff = resemble(file1)
    .compareTo(file2)
    .ignoreColors()
    .onComplete(function(data){
      console.log(data);

      fs.writeFile(`compare-${Date.now()}.png`, data.getBuffer(), function(err) {
        res.send(data);
      });
      /*
      {
        misMatchPercentage : 100, // %
        isSameDimensions: true, // or false
        dimensionDifference: { width: 0, height: -1 }, // defined if dimensions are not the same
        getImageDataUrl: function(){}
      }
      */
    });
});

app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
