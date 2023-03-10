async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    if (request.headers.get("Upgrade") == "websocket") {
      let pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ error: err.stack }));
      pair[1].close(1011, "Uncaught exception during session setup");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response(err.stack, { status: 500 });
    }
  }
}

async function readRequestBody(request) {
  const contentType = request.headers.get("content-type");
  if (contentType.includes("application/json")) {
    return JSON.stringify(await request.json());
  }
  return false
}

  // ############## REQUEST HANDLER ############
  async function handleRequest(request, env) {
    let id = "system"
    id = env.rooms.idFromName(id);
    let roomObject = env.rooms.get(id);
    let newUrl = new URL(request.url);
    return roomObject.fetch(newUrl, request);
  }

// ######### MAIN HANDLER ########

export default {
  async fetch(request, env) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);
      let path = url.pathname.slice(1).split("/");
      if (!path[0]) {
        return new Response("Cloudfare worker running", { status: 200 });
      }
        return await handleRequest(request, env);
    })
  },
};


// =======================================================================================
// The ChatRoom Durable Object Class

// ChatRoom implements a Durable Object that coordinates an individual chat room. Participants
// connect to the room using WebSockets, and the room broadcasts messages from each participant
// to all others.

const endpoints = [
  "snackbar_to_client",
  "noty_to_client",
  "popup_to_client",
  "noty_to_checker",
];

export class Room {
  constructor(controller, env) {
    this.storage = controller.storage;
    this.env = env;
    this.sessions = [];
  }

  // The system will call fetch() whenever an HTTP request is sent to this Object. Such requests
  // can only be sent from other Worker code, such as the code above; these requests don't come
  // directly from the internet. In the future, we will support other formats than HTTP for these
  // communications, but we started with HTTP for its familiarity.
  async fetch(request) {
    return await handleErrors(request, async () => {
      const wsPattern = /^\/+ws\/notification\/+[(^\S+@\S+\.\S)]+\/$/g;
      let url = new URL(request.url);

      if (url.pathname.match(wsPattern)) {
        // WebSocket session.
        if (request.headers.get("Upgrade") != "websocket") {
          return new Response("expected websocket", { status: 400 });
        }

        let pair = new WebSocketPair();
        let items = url.pathname.split("/");
        let username = items[items.length - 2];
        // We're going to take pair[1] as our end, and return pair[0] to the client.
        await this.handleSession(pair[1], username);

        // Now we return the other end of the pair to the client.
        return new Response(null, { status: 101, webSocket: pair[0] });
      } else {
        return await this.handleAPI(request);
      }
    });
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async handleSession(webSocket, name) {
    webSocket.accept();

    let session = { webSocket, name: name };
    let isJoined = false;
    this.sessions.push(session);

    webSocket.addEventListener("message", async (msg) => {
      try {
        let data = JSON.parse(msg.data);

        // First join into room
        if (!isJoined) {
          isJoined = true;
          // Broadcast to all other connections that this user has joined.
          this.broadcast({ joined: session.name });
          return;
        }

        // User chat
        if (data.type && data.type === "chat") {
          data = { name: session.name, message: "" + data.message };
          let dataStr = JSON.stringify(data);
          this.broadcast(dataStr);
          return;
        }
      } catch (err) {
        webSocket.send(JSON.stringify({ error: err.stack }));
      }
    });
    // Handle error disconnect or close ws by client
    let closeOrErrorHandler = async (evt) => {
      this.sessions = this.sessions.filter(
        (member) => member.name !== session.name
      );
      if (session.name) {
        this.broadcast({ quit: session.name });
      }
    };
    webSocket.addEventListener("close", closeOrErrorHandler);
    webSocket.addEventListener("error", closeOrErrorHandler);
  }

  async handleAPI(request) {
    let url = new URL(request.url);
    let paths = url.pathname.split("/");
    if (
      request.method === "POST" &&
      paths.length === 3 &&
      endpoints.indexOf(paths[1]) !== -1
    ) {
      let data = await readRequestBody(request);

      if (data === false)
        return new Response("Only support method POST with JSON data", {
          status: 400,
        });
      data = JSON.parse(data);

      let receiver = data?.receiver;
      let type = data?.type;

      if (!receiver || !type || endpoints.indexOf(type) === -1)
        return new Response("receiver, type is invalid", { status: 400 });

      // Noty from system
      if (receiver === "system") {
        delete data.receiver;
        let message = JSON.stringify(data);
        this.broadcast(message);
        return this.sendSuccessResponse();
      } else {
        // other type not  "system" receiver
        delete data.receiver;
        let message = JSON.stringify(data);
        console.log(message);
        this.sendToSpecifical(receiver, message);
        return this.sendSuccessResponse();
      }
    }
    return new Response("API endpoint not exist", { status: 404 });
  }

  sendSuccessResponse() {
    const result = JSON.stringify({
      success: true,
      message: "Send noty success",
    });
    return new Response(result, {
      status: 200,
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    });
  }

  // broadcast() broadcasts a message to all clients.
  broadcast(message) {
    console.log("broadcast", message);
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }

    this.sessions.forEach((session) => {
      if (session.name) {
        try {
          session.webSocket.send(message);
        } catch (err) {
          console.log(err);
        }
      }
    });
  }

  sendToSpecifical(email, message) {
    this.sessions.forEach((session) => {
      if (session.name === email) {
        try {
          session.webSocket.send(message);
        } catch (err) {
          console.log(err);
        }
      }
    });
  }
}