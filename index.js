const express = require("express");
const app = express();
const http = require("http");
const { default: ShortUniqueId } = require("short-unique-id");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

var uid = new ShortUniqueId();

app.use("/static", express.static("public"));

// const dogCards = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const dogCards = ["0", "1", "2", "3"];

const rooms = {};

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log(socket.id, "a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("joinRoom", (room) => {
    if (socket.room) {
      const room = socket.room;
      delete socket.room;
      socket.leave(room);
    }

    const gameState = rooms[room];
    if (gameState && gameState.adminId !== socket.id && !gameState.guestId) {
      gameState.guestId = socket.id;

      const shuffledCard = [...dogCards, ...dogCards]
        .sort(() => Math.random() - 0.5)
        .map((id) => ({ id }));

      gameState.turn = "A";
      gameState.guestId = socket.id;
      gameState.round = 0;
      gameState.board = shuffledCard;
      socket.room = room;
      socket.join(room);

      io.to(gameState.adminId).emit("gameStarted", {
        ...gameState,
        isMyTurn: gameState.turn === "A",
      });
      io.to(gameState.guestId).emit("gameStarted", {
        ...gameState,
        isMyTurn: gameState.turn === "G",
      });
    } else {
      socket.emit("joinRoomFailed");
    }
  });

  socket.on("endGame", () => {
    const room = socket.room;

    if (rooms[room] && rooms[room].adminId === socket.id) {
      io.to(room).emit("roomDeleted");
      io.in(room).socketsLeave();
      delete rooms[room];
    }
  });

  socket.on("createRoom", () => {
    const roomId = uid.randomUUID(5).toUpperCase();
    const previousRoom = socket.room;

    if (previousRoom) {
      delete socket.room;
      io.to(previousRoom).emit("roomDeleted");
      io.in(previousRoom).socketsLeave();
    }
    rooms[roomId] = { roomId, adminId: socket.id };
    socket.join(roomId);
    socket.room = roomId;
    console.log(socket.id, "room created", roomId);
    socket.emit("roomCreated", roomId);
  });

  socket.on("getRoomState", () => {
    const gameState = rooms[socket.room];
    if (
      gameState &&
      (gameState.adminId === socket.id || gameState.guestId === socket.id)
    ) {
      io.to(socket.room).emit("boardUpdated", gameState);
    }
  });

  socket.on("flipCard", (index) => {
    const gameState = rooms[socket.room];

    if (
      gameState &&
      ((gameState.turn === "A" && gameState.adminId === socket.id) ||
        (gameState.turn === "G" && gameState.guestId === socket.id)) &&
      (gameState.choiceTwo === undefined ||
        gameState.choiceOne === undefined) &&
      gameState.choiceTwo !== index &&
      gameState.choiceOne !== index
    ) {
      gameState.round = gameState.round + 1;
      gameState.choiceOne !== undefined
        ? (gameState.choiceTwo = index)
        : (gameState.choiceOne = index);
      const board = gameState.board;

      if (
        gameState.choiceTwo !== undefined &&
        gameState.choiceOne !== undefined
      ) {
        const resetTurn = () => {
          gameState.choiceTwo = undefined;
          gameState.choiceOne = undefined;
        };
        if (board[gameState.choiceTwo].id === board[gameState.choiceOne].id) {
          board[gameState.choiceTwo] = {
            ...board[gameState.choiceTwo],
            flipped: true,
          };
          board[gameState.choiceOne] = {
            ...board[gameState.choiceOne],
            flipped: true,
          };
          const isEnd =
            board.length !== 0 &&
            board.filter((card) => !card.flipped).length === 0;

          if (isEnd) {
            io.to(gameState.roomId).emit("gameEnd");
          }

          resetTurn();
        } else {
          setTimeout(() => {
            resetTurn();
            gameState.turn === "A"
              ? (gameState.turn = "G")
              : (gameState.turn = "A");
            io.to(gameState.adminId).emit("boardUpdated", {
              ...gameState,
              isMyTurn: gameState.turn === "A",
              isAdmin: true,
            });
            io.to(gameState.guestId).emit("boardUpdated", {
              ...gameState,
              isMyTurn: gameState.turn === "G",
              isAdmin: false,
            });
          }, 1000);
        }
      }
      io.to(gameState.adminId).emit("boardUpdated", {
        ...gameState,
        isMyTurn: gameState.turn === "A",
        isAdmin: true,
      });
      io.to(gameState.guestId).emit("boardUpdated", {
        ...gameState,
        isMyTurn: gameState.turn === "G",
        isAdmin: false,
      });
    }
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("listening on *:", PORT);
});
