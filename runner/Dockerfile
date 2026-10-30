# Sandbox image that compiles and runs user code. One container per submission.
# Python also has NumPy, pandas, SciPy and scikit-learn for the ML course, and FastAPI
# (with Pydantic, Starlette's TestClient, SQLAlchemy and PyJWT) for the FastAPI course.
# Alpine has no FastAPI package; 0.110.3 is the release that matches Alpine's Starlette 0.37.
# Go has Gin plus the libraries the Go + Gin course uses (JWT, bcrypt, GORM with
# pure-Go SQLite, WebSockets, UUID). Jobs have no network, so the modules and a
# warm, read-only build cache (all of std and every module) are baked in: a
# Gin program then compiles in about a second inside the 64 MB /tmp.
FROM alpine:3.20
LABEL qc.runner="5"
RUN apk add --no-cache python3 nodejs g++ openjdk21-jdk \
    py3-numpy py3-pandas py3-scipy py3-scikit-learn \
    py3-pydantic py3-starlette py3-httpx py3-anyio py3-typing-extensions py3-email-validator \
    py3-python-multipart py3-sqlalchemy py3-jwt \
 && apk add --no-cache --virtual .pip py3-pip \
 && pip install --no-cache-dir --no-deps --break-system-packages fastapi==0.110.3 \
 && apk del .pip
ENV PATH="/usr/lib/jvm/java-21-openjdk/bin:${PATH}" \
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
    HOME=/tmp MPLCONFIGDIR=/tmp PYTHONWARNINGS=ignore
RUN apk add --no-cache go
ENV GOPATH=/opt/go GOMODCACHE=/opt/go/pkg/mod GOCACHE=/opt/gocache \
    GOTOOLCHAIN=local GOFLAGS=-mod=mod GOPROXY=off GOSUMDB=off CGO_ENABLED=0
COPY gomod/ /judge/gomod/
RUN cd /judge/gomod \
 && GOPROXY=https://proxy.golang.org,direct go mod download all \
 && go build -o /tmp/warm . && go build std && rm /tmp/warm \
 && chmod -R a+rX /opt/go /opt/gocache /judge/gomod
COPY judge.py /judge/judge.py
WORKDIR /tmp
