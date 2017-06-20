# Tamper Api

> HTTP Instrumentation (from the page-side)

A chrome extension providing the ability for page-side js to modify http requests and responses, based on a variety of conditions.

## Getting Started

### Installation

You can get it from the [webstore](https://chrome.google.com/webstore/detail/tamper-api/ignadckeobailngfiafhdgcbkimllpdo).

### Usage

Grabs a url with custom request headers:

```javascript
var tamper = {
    headers: {
        Origin: 'totally-not-evil.com'
    }
};

var url = TamperApi.makeUrl('http://foo.com', tamper);

fetch(url); // or whatever
```

It can also alter response headers.

For example, to make a Cross-Origin request look normal to the server (and succeed in the browser):

```javascript
var tamper = {
    headers : {
        Origin: null // null means to remove this header
    },
    response : {
        headers : {
          access-control-allow-origin : '*'
        }
    }
};

var url = TamperApi.makeUrl('http://cross-origin.com', tamper);
```

Tampering can also be done by regex match (against request url).

Useful if you want to effect some functionality that you don't pass a url to directly.

```javascript

// add returns a promise
TamperApi.add({
    regexes : [ /\?q=lumberjack/, /* ... */ ], // if anything in this list matches, tampering will occur
    tamper : { /* ... */ },
}).then(() => {
    searchFor('lumberjack');
});

```

## License

This project is released into the public domain via the Unlicense - see the [LICENSE.md](LICENSE.md) file for details

## Development Setup

To install a copy for local work, or if you just don't want to get it via the webstore, you may use Chrome's Developer Mode.

1. Clone the repo
2. In top right of chrome, click the vertical-ellipsis > More Tools > Extensions
3. Check the box labelled 'Developer mode'
4. Click 'Load Unpacked Extension'
5. Select directory 'ext' under the repo root.

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b feature-fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin feature-fooBar`)
5. Create a new Pull Request
