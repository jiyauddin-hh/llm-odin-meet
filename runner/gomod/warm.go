// Imports every library the Go course may use so the image's build cache has
// them compiled. The judge copies only go.mod and go.sum next to user code.
package main

import (
	_ "net/http/httptest"

	_ "github.com/gin-gonic/gin"
	_ "github.com/gin-gonic/gin/binding"
	_ "github.com/glebarez/sqlite"
	_ "github.com/golang-jwt/jwt/v5"
	_ "github.com/google/uuid"
	_ "github.com/gorilla/websocket"
	_ "golang.org/x/crypto/bcrypt"
	_ "gorm.io/gorm"
)

func main() {}
