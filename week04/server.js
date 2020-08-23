//http包
const http = require('http');

//调用http的createServer，按照格式接收request的内容
http.createServer((request, response) => {
    let body = [];
    //接收error事件
    request.on('error', (err) => {
        console.error(err);
    //接收data事件
    }).on('data', (chunk) => {
        body.push(chunk.toString());//暂存到body数组
    //接收end事件
    }).on('end', () => {
        //body = Buffer.concat(body).toString();
        body = body.toString();//拼凑数组
        console.log("body", body);//方便解析
        response.writeHead(200, {'Content-Type': 'text/html'});//至少要写Content-Type
        response.end(`
<html maaa="a" >
    <head>
    <style>
        #container {
            width:500px;
            height:300px;
            display:flex;
            background-color:rgb(255,255,255);
        }
        #container #myid {
            width:200px;
            height:100px;
            background-color:rgb(255,0,0);
        }
        #container .c1 {
            flex:1;
            background-color:rgb(0,255,0);
        }
    </style>
    </head>
    <body>
        <div id="container">
            <div id="myid" />
            <div class="c1" /> 
        </div> 
    </body>
</html>`);
    });
}).listen(8088);

console.log('server start');