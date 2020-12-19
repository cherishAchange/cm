const Koa = require('koa');
const app = new Koa();
const http = require('http');
const server = http.createServer(app.callback());
const io = require('socket.io')(server);

const allConnection = {};
// socket.io
io.on('connection', (socket) => {
    
    // socket用id存进字典
    allConnection[socket.id] = socket;

    // 告诉客户端目前有哪些连接
    socket.broadcast.emit('people-join', { message: '有新朋友加入了', userList: Object.keys(allConnection) });

    // 返回自己的信息
    socket.emit('own-info', { own: socket.id, userList: Object.keys(allConnection) });

    // video-offer
    socket.on('video-offer', (data) => {
        // console.log('video-offer', data);
        allConnection[data.target].send(data);
    });

    // video-answer
    socket.on('video-answer', (data) => {
        // console.log('video-offer', data);
        allConnection[data.target].send(data);
    });

    // new-ice-candidate
    socket.on('new-ice-candidate', (data) => {
        allConnection[data.target].send(data);
    })

    socket.on('disconnect', () => {
        delete allConnection[socket.id];
        socket.broadcast.emit('people-leave', { message: '有一位朋友离开了', userList: Object.keys(allConnection) });
    });
});

server.listen(5599);

console.log('[地址为:http://localhost:5599]');