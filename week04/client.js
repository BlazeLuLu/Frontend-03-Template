const net = require('net');
const parser = require('./parser.js');
const images = require('images');
const render = require('./render');

//定义TrunkedBodyParser
class TrunkedBodyParser {
  constructor() {
    //处理长度
    this.WAITING_LENGTH = 0;
    this.WAITING_LENGTH_LINE_END = 1;
    this.READING_TRUNK = 2;
    //new line
    this.WAITING_NEW_LINE = 3;
    this.WAITING_NEW_LINE_END = 4;
    this.length = 0;
    this.content = [];
    this.isFinished = false;
    this.current = this.WAITING_LENGTH;
  }
  receiveChar(char) {
    if (this.current === this.WAITING_LENGTH) {
      if (char === '\r') {
        if (this.length === 0) {
          this.isFinished = true;
        }
        this.current = this.WAITING_LENGTH_LINE_END;
      } else {
        this.length *= 16;
        this.length += parseInt(char, 16);
      }
    } else if (this.current === this.WAITING_LENGTH_LINE_END) {
        //console.log("WAITING_LENGTH_LINE_END");
        if (char === '\n') {
          this.current = this.READING_TRUNK;
        }
    } else if (this.current === this.READING_TRUNK) {
      this.content.push(char);
      this.length --;
      if (this.length === 0) {
        this.current = this.WAITING_NEW_LINE;
      }
    } else if (this.current === this.WAITING_NEW_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_NEW_LINE_END;
      }
    } else if (this.current === this.WAITING_NEW_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_LENGTH;
      }
    }
  }
}

//ResponeseParser
class ResponseParser {
  constructor() {
    //等待/r/n，两个状态
    this.WAITING_STATUS_LINE = 0;
    this.WAITING_STATUS_LINE_END = 1;
    //header的四个状态
    this.WAITING_HEADER_NAME = 2;
    this.WAITING_HEADER_SPACE = 3;
    this.WAITING_HEADER_VALUE = 4;
    this.WAITING_HEADER_LINK_END = 5;
    //header之后的空行，等待HEADER_BLOCK_END状态
    this.WAITING_HEADER_BLOCK_END = 6;
    //body状态
    this.WAITING_BODY = 7;

    //存储解析过程中的一些结果
    this.current = this.WAITING_STATUS_LINE;
    this.headers = {};
    this.headerName = '';
    this.headerValue = '';
    this.bodyParser = null;//加入bodyParser变量，当找到WAITING_BODY状态时，把char塞给bodyParser去处理
  }
  get isFinished() {
    return this.bodyParser && this.bodyParser.isFinished;
  }
  get response() {
    this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/);
    return {
      statusCode: RegExp.$1,
      statusText: RegExp.$2,
      headers: this.headers,
      body: this.bodyParser.content.join('')
    }
  }
  //recive函数接口接收字符串
  receive(string) {
    //console.log(string);
    //把一个一个字符传给receiveChar
    for(let i = 0; i < string.length; i++) {
      this.receiveChar(string.charAt(i));
    }
    // for (let s of string) {
    //   this.receiveChar(s);
    // }
  }

  //状态机代码，用if区分每一个状态，char会影响每个状态之后的下一个状态
  receiveChar(char) {
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END;
      } else {
        this.statusLine += char
      }
    } else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME;
      }
    } else if (this.current === this.WAITING_HEADER_NAME) {
      if (char === ':') {
        this.current = this.WAITING_HEADER_SPACE;
      } else if (char === '\r') {
        this.current = this.WAITING_HEADER_BLOCK_END;
        //在header中去找Transfer-Encoding，node的默认值是chunked
        if (this.headers['Transfer-Encoding'] === 'chunked') {
          this.bodyParser = new TrunkedBodyParser();
        }
      } else {
        this.headerName += char;
      }
    } else if (this.current === this.WAITING_HEADER_SPACE) {
      if (char ===' ') {
        this.current = this.WAITING_HEADER_VALUE;
      }
    } else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === '\r') {
        this.current = this.WAITING_HEADER_LINK_END;
        console.log(this.headers);
        this.headers[this.headerName] = this.headerValue;
        this.headerName = "";
        this.headerValue = "";
      } else {
        this.headerValue += char;
      }
    } else if (this.current === this.WAITING_HEADER_LINK_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME;
      }
    } else if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === '\n') {
        this.current = this.WAITING_BODY;
      }
    } else if (this.current === this.WAITING_BODY) {
      //console.log(char)
      this.bodyParser.receiveChar(char);
    }
  }
};

//request类的实现
class Request {
  //把options传进来的数据进行整理，补全Content-Type和Content-Length
  constructor(options) {
    this.method = options.method || 'GET';
    this.host = options.host;
    this.port = options.port || 80;
    this.path = options.path || '/';
    this.body = options.body || {};
    this.headers = options.headers || {};
    //http协议中一定要有Content-Type这个header，否则body无法解析
    if (!this.headers['Content-Type']) {
      this.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (this.headers['Content-Type'] === 'application.json') {
      this.bodyText = JSON.stringify(this.body);//srtingify
    } else if (this.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&');//&符分割
    }
    //Content-Length从body中取出length，如果不对是非法请求
    this.headers['Content-Length'] = this.bodyText.length;
  }
  //http的请求头、header、bodyText
  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r
${Object.keys(this.headers).map(key => `${key}: ${this.headers[key]}`).join('\r\n')}\r
\r
${this.bodyText}`;
  }

  //send函数，逐步收到response，respone构造好后再由promise得到resolve
  send(connection) { //接收connection参数，在已建立好的TCP连接上把请求发出去；若没传，创建新的TCP连接
    //返回new Promise
    return new Promise((resolve, reject) => {
      const parser = new ResponseParser();//设计一个ResponseParser，Parse逐步接收respones信息来构建response对象
      if (connection) {
        connection.write(this.toString());//connection存在，直接把自己的toString给write上去
      } else {
        //createConnection环节，如果没有connection参数，创建tcp连接
        connection = net.createConnection({
          host: this.host,
          port: this.port
        }, () => {
          connection.write(this.toString());
        })
      }
      //监听connection的data
      connection.on('data', (data) => {
        console.log(data.toString());//打印
        parser.receive(data.toString());//把data变成字符串传给parse
        if (parser.isFinished) {//parser结束
          resolve(parser.response);//执行resolve把整个Promise结束
          connection.end();//关闭connection
        }
      });
      //遇到错误reject整个Promise，防止出错占用连接
      connection.on('error', (err) => {
        console.log('error', err);
        reject(err);
        connection.end();//关闭connection
      });
      // resolve(“”);
    })
  }
}

void async function () {
  //创建http请求时，传入一个config object
  let request = new Request({
    method: 'POST',//http请求方法
    host: '127.0.0.1',//ip层
    port: '8088',//tcp层
    path: '/',//http路径
    //headers
    headers: {
      ['X-Foo2']: 'customed'
    },
    //body
    body: {
      name: 'lulu'
    }
  });

  let response = await request.send();//请求结束，调用send方法返回一个promise，promise成功后得到response对象
    
  console.log('resp', response);
  
  let dom = parser.parserHTML(response.body);//把response的body交给parser处理，变成dom树
  
  console.log(dom[0].children[1]);
  
  let viewPort = images(800, 600);

  render(viewPort, dom[0]);

  viewPort.save('viewport.jpg');

}();