import React from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, Avatar, List, message } from 'antd';
import 'antd/dist/antd.css';

import IO from 'socket.io-client';

const mediaConstraints = {
  audio: true,
  video: true,
};

class App extends React.Component {

  socket = null;
  myPeerConnection = null;

  constructor(props) {
    super(props);
    this.state = {
      own: 'own',
      target: 'target',
      usernameList: [{ name: '小明', desc: '这是一个签名' }, { name: '消化', desc: '这是一个签名' }],
    };
  }

  componentDidMount() {
    // 连接到服务器
    this.connetListen();

    // 获取用户列表
  }

  componentWillUnmount() {
    this.socket.close();
  }

  // 初始化webRTC
  invite = () => {
    if (this.myPeerConnection) {
      alert("You can't start a call because you already have one open!");
    } else {

      this.createPeerConnection();

      navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then((localStream) => {
          document.getElementById("local_video").srcObject = localStream;
          localStream.getTracks().forEach(track => this.myPeerConnection.addTrack(track, localStream));
        })
        .catch(this.handleGetUserMediaError);
    }
  }

  handleGetUserMediaError = (e) => {
    switch (e.name) {
      case "NotFoundError":
        alert("Unable to open your call because no camera and/or microphone" +
          "were found.");
        break;
      case "SecurityError":
      case "PermissionDeniedError":
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        alert("Error opening your camera and/or microphone: " + e.message);
        break;
    }

    this.closeVideoCall();
  }

  closeVideoCall = () => {
    const remoteVideo = document.getElementById("received_video");
    const localVideo = document.getElementById("local_video");

    if (this.myPeerConnection) {
      this.myPeerConnection.ontrack = null;
      this.myPeerConnection.onremovetrack = null;
      this.myPeerConnection.onremovestream = null;
      this.myPeerConnection.onicecandidate = null;
      this.myPeerConnection.oniceconnectionstatechange = null;
      this.myPeerConnection.onsignalingstatechange = null;
      this.myPeerConnection.onicegatheringstatechange = null;
      this.myPeerConnection.onnegotiationneeded = null;

      if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      }

      if (localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach(track => track.stop());
      }

      this.myPeerConnection.close();
      this.myPeerConnection = null;
    }

    remoteVideo.removeAttribute("src");
    remoteVideo.removeAttribute("srcObject");
    localVideo.removeAttribute("src");
    remoteVideo.removeAttribute("srcObject");
  }

  createPeerConnection = () => {
    this.myPeerConnection = new RTCPeerConnection({
      iceServers: [     // Information about ICE servers - Use your own!
        {
          urls: "stun://www.tlfaner.cn"
        }
      ]
    });

    this.myPeerConnection.onicecandidate = this.handleICECandidateEvent;
    this.myPeerConnection.ontrack = this.handleTrackEvent;
    this.myPeerConnection.onnegotiationneeded = this.handleNegotiationNeededEvent;
    this.myPeerConnection.onremovetrack = this.handleRemoveTrackEvent;
    this.myPeerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
    this.myPeerConnection.onicegatheringstatechange = this.handleICEGatheringStateChangeEvent;
    this.myPeerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
  }

  handleTrackEvent = (event) => {
    document.getElementById("received_video").srcObject = event.streams[0];
  }

  handleRemoveTrackEvent = () => {
    const stream = document.getElementById("received_video").srcObject;
    const trackList = stream.getTracks();

    if (trackList.length == 0) {
      this.closeVideoCall();
    }
  }

  handleSignalingStateChangeEvent = () => {
    switch (this.myPeerConnection.signalingState) {
      case "closed":
        this.closeVideoCall();
        break;
    }
  }

  handleICEGatheringStateChangeEvent = () => {

  }

  handleICEConnectionStateChangeEvent = (event) => {
    switch (this.myPeerConnection.iceConnectionState) {
      case "closed":
      case "failed":
        this.closeVideoCall();
        break;
    }
  }

  handleICECandidateEvent = (event) => {
    console.log('handleICECandidateEvent');
    if (event.candidate) {
      this.newIceCandidate(event);
    }
  }

  newIceCandidate = (event) => {
    this.socket.emit('new-ice-candidate', {
      type: "new-ice-candidate",
      target: this.state.target,
      candidate: event.candidate,
    });
  }

  // 协商
  handleNegotiationNeededEvent = () => {
    console.log('handleNegotiationNeededEvent');
    this.myPeerConnection.createOffer().then((offer) => {
      return this.myPeerConnection.setLocalDescription(offer);
    })
      .then(this.videoOffer)
      .catch(this.reportError);
  }

  reportError = (e) => {
    alert('reportError' + e.message);
  }

  videoOffer = () => {
    this.socket.emit('video-offer', {
      type: 'video-offer',
      name: this.state.own,
      target: this.state.target,
      sdp: this.myPeerConnection.localDescription
    });
  }

  connetListen = () => {
    this.socket = IO();
    this.socket.on('people-join', (data) => {
      message.info(data.message);
      this.setState({ usernameList: (data.userList || []).map(v => ({ name: v, desc: '这是一个签名' })) });
    });

    this.socket.on('people-leave', (data) => {
      message.error(data.message);
      this.setState({ usernameList: (data.userList || []).map(v => ({ name: v, desc: '这是一个签名' })) });
    });

    this.socket.on('own-info', (data) => {
      this.setState({ own: data.own, usernameList: (data.userList || []).map(v => ({ name: v, desc: '这是一个签名' })) });
    });

    this.socket.on('message', (data) => {
      if (data.type === 'video-offer') {
        console.log('收到邀请，给出回答');
        this.setState({ target: data.name }, () => {
          // 收到邀请时给出回答
          this.handleVideoOfferMsg(data);
        });
      } else if (data.type === 'video-answer') {
        console.log('得到回答');
        // 收到回答后开始连接
        this.handleVideoAnswerMsg(data);
      } else if (data.type === 'new-ice-candidate') {
        this.handleNewICECandidateMsg(data);
      }
    });
  }

  handleVideoAnswerMsg = (msg) => {
    const desc = new RTCSessionDescription(msg.sdp);
    this.myPeerConnection.setRemoteDescription(desc);
  }

  handleVideoOfferMsg = (msg) => {
    let localStream = null;
    this.createPeerConnection();

    const desc = new RTCSessionDescription(msg.sdp);

    this.myPeerConnection.setRemoteDescription(desc).then(() => {
      return navigator.mediaDevices.getUserMedia(mediaConstraints);
    })
      .then((stream) => {
        localStream = stream;
        document.getElementById("local_video").srcObject = localStream;

        localStream.getTracks().forEach(track => this.myPeerConnection.addTrack(track, localStream));
      })
      .then(() => {
        return this.myPeerConnection.createAnswer();
      })
      .then((answer) => {
        return this.myPeerConnection.setLocalDescription(answer);
      })
      .then(() => {
        this.socket.emit('video-answer', {
          type: 'video-answer',
          name: this.state.own,
          target: this.state.target,
          sdp: this.myPeerConnection.localDescription
        });
      })
      .catch(this.handleGetUserMediaError);
  }

  handleNewICECandidateMsg = (msg) => {
    const candidate = new RTCIceCandidate(msg.candidate);

    this.myPeerConnection.addIceCandidate(candidate)
      .catch(this.reportError);
  }

  handleCall = (name) => {
    if (this.state.own === name) {
      message.warn('跟自己连啥呀');
      return;
    }
    this.setState({ target: name }, () => {
      this.invite();
    });
  }

  render() {
    const { usernameList, own } = this.state;
    return (
      <div className="App">
        <div className="user-list">
          <Button type="primary">{own}</Button>
          <div>
            <List
              itemLayout="horizontal"
              dataSource={usernameList}
              renderItem={item => (
                <List.Item onClick={() => this.handleCall(item.name)}>
                  <List.Item.Meta
                    avatar={<Avatar src="https://zos.alipayobjects.com/rmsportal/ODTLcjxAfvqbxHnVXCYX.png" />}
                    title={item.name}
                    description={item.desc}
                  />
                </List.Item>
              )}
            />
          </div>
        </div>
        <div className="video-area">
          <div className="remote-box">
            your friend
            <video id="received_video" autoPlay></video>
          </div>
          <div className="local-box">
            yourself
            <video id="local_video" autoPlay muted></video>
          </div>
          <Button type="primary">
            Hang Up
          </Button>
        </div>
      </div>
    );
  }
}

export default App;
