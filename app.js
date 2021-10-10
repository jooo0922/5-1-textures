"use strict";

let gl, canvas;
let pwgl = {}; // 컨텍스트 상실을 고려하여, 이전에 웹지엘 객체들에 추가하던 임의의 속성값들은 전역 객체인 pwgl에 추가하도록 함.
pwgl.ongoingImageLoads = []; // 이미지 객체가 '로딩 중'일 때, 컨텍스트 상실이 발생하면, onload 에 할당된 이벤트핸들러를 제거해 로딩을 중단해야 하므로, 현재 로딩중인 이미지 객체를 모아둘(추척할) 배열을 마련함.

function createGLContext(canvas) {
  const names = ["webgl", "experimental-webgl"];
  let context = null;

  for (let i = 0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch (error) {}

    if (context) {
      break; // context를 성공적으로 받아오면 다음 반복문으로 넘어가지 말고 중단함.
    }
  }

  if (context) {
    // 예제 원문에서 사용하는 코드는 안티패턴이므로 작성하지 않도록 함.
  } else {
    alert("Failed to create WebGL context!"); // 반복문을 다 돌고 나서도 WebGLRenderingContext 를 리턴받지 못했을 때 경고창을 띄워 줌.
  }

  return context; // 최종적으로 리턴받은 WebGLRenderingContext 또는 null값을 리턴해 줌.
}

function loadShaderFromDOM(id) {
  const shaderScript = document.getElementById(id);

  if (!shaderScript) {
    return null; // 인자로 전달받은 id값을 갖고있는 스크립트 태그가 없다면 null을 리턴하고 함수를 끝냄
  }

  let shaderSource = ""; // 셰이더 스크립트의 소스코드를 문자열로 합쳐서 담아놓을 변수
  let currentChild = shaderScript.firstChild;
  while (currentChild) {
    // currentChild.nodeType === 3 인지를 체크하는 것은, currentChild가 TEXT_NODE 인지를 확인하려는 것!
    if (currentChild.nodeType === 3) {
      shaderSource += currentChild.textContent;
    }
    // if block에서 문자열을 결합해준 뒤, 그 다음 형제노드를 currentChild에 넣어서 다음 반복문으로 넘어가려는 것
    // -> But, 형제 노드가 더 이상 없으므로, 이 반복문은 한 번만 돌고 끝나게 됨.
    currentChild = currentChild.nextSibling;
  }

  // 스크립트 태그에 지정된 type값에 따라 알맞은 셰이더 객체를 만듦. 해당하는 type이 없다면 null을 리턴하고 함수를 중단함.
  let shader;
  if (shaderScript.type === "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type === "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource); // 문자열로 가져온 셰이더 코드를 셰이더 객체에 로드함.
  gl.compileShader(shader); // 셰이더 객체를 GPU가 읽을 수 있도록 컴파일함.

  // 컨텍스트 상실에 의해 셰이더 객체가 무효화되서 경고창이 뜨는 경우가 없도록, 컨텍스트 상실 여부도 조건문에서 체크함.
  if (
    !gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
    !gl.isContextLost()
  ) {
    alert(gl.getShaderInfoLog(shader));
    return null; // 컨텍스트 상실이 발생하지 않은 상태에서 셰이더 컴파일이 실패했다면, null을 리턴하고 함수를 중단함.
  }

  return shader; // 여기까지 무사히 왔으면 컴파일까지 끝마친 셰이더 객체를 리턴해 줌.
}

function setupShaders() {
  const vertexShader = loadShaderFromDOM("shader-vs");
  const fragmentShader = loadShaderFromDOM("shader-fs");

  const shaderProgram = gl.createProgram(); // 프로그램 객체 생성
  gl.attachShader(shaderProgram, vertexShader); // 버텍스 셰이더를 프로그램 객체에 붙임
  gl.attachShader(shaderProgram, fragmentShader); // 프래그먼트 셰이더를 프로그램 객체에 붙임
  gl.linkProgram(shaderProgram); // 프로그램 객체에 붙은 두 셰이더를 링크해 줌.

  // 컨텍스트 상실에 의해 프로그램 객체가 무효화되서 경고창이 뜨는 경우가 없도록, 컨텍스트 상실 여부도 조건문에서 체크함.
  if (
    !gl.getProgramParameter(shaderProgram, gl.LINK_STATUS) &&
    !gl.isContextLost()
  ) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram); // GPU가 프로그램 객체를 사용할 수 있도록 명령함.

  // gl.getAttribLocation()을 이용해서 셰이더 내의 애트리뷰트 변수들의 제네릭 애트리뷰트 인덱스를 받아온 뒤, 전역 객체인 pwgl에 저장함. (컨텍스트 상실 고려)
  pwgl.vertexPositionAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    "aVertexPosition"
  );
  pwgl.vertexTextureAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    "aTextureCoordinates"
  );

  // gl.getUniformLocation()을 이용해서 셰이더 내의 유니폼 변수들의 WebGLUniformLocation 객체를 받아온 뒤, 전역 객체인 pwgl에 저장함. (컨텍스트 상실 고려)
  pwgl.uniformMVMatrixLoc = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  pwgl.uniformProjMatrixLoc = gl.getUniformLocation(shaderProgram, "uPMatrix");
  pwgl.uniformSamplerLoc = gl.getUniformLocation(shaderProgram, "uSampler");

  // 버텍스 좌표 데이터와 각 버텍스에 해당하는 텍스쳐 좌표 데이터를 쏴줄 각 애트리뷰트 변수들을 활성화함.
  gl.enableVertexAttribArray(pwgl.vertexPositionAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexTextureAttributeLoc);

  pwgl.modelViewMatrix = mat4.create(); // 모델뷰 행렬을 위한 빈 4*4 행렬
  pwgl.projectionMatrix = mat4.create(); // 투영 행렬을 위한 빈 4*4 행렬
  pwgl.modelViewMatrixStack = []; // 모델뷰 행렬을 push / pop 할 때, stack처럼 사용할 배열
}

function setupFloorBuffers() {
  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 위치 데이터 WebGLBuffer 생성
  // WebGLBuffer를 생성한 뒤 pwgl 전역객체에 저장해 둠!
  // -> Why? 원래 이전 예제에서도 WebGLBuffer는 전역변수에 저장해뒀는데, 이제 전역객체는 pwgl만 만들어놨으니, 전역변수를 따로 만드는 대신 pwgl에 넣어두는거지!
  pwgl.floorVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexPositionBuffer); // gl.bufferData() 메서드로 어떤 WebGLBuffer 객체에 데이터를 기록해줄 것인지 바인딩함.

  const floorVertexPosition = [
    // y좌표값(높이)가 0인 4개의 버텍스 좌표를 기록해 둠. (이거를 삼각형 팬 형태로 연결하면 사각형 floor가 됨.)
    5.0,
    0.0,
    5.0, //v0
    5.0,
    0.0,
    -5.0, //v1
    -5.0,
    0.0,
    -5.0, //v2
    -5.0,
    0.0,
    5.0, //v3
  ]; // 버텍스 셰이더에서 투영 변환하여 클립좌표(-1.0 ~ 1.0)로 변환해 줌. 굳이 버텍스 데이터를 클립좌표로 안넣어도 됨.

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexPosition), // 위의 버텍스 좌표 배열에 실수값만 들어가니 Float32Array 로 뷰타입 생성
    gl.STATIC_DRAW
  );

  // 원래같으면 WebGLBuffer 객체에 넣어둘 값들을 전역객체 pwgl에 분리하여 저장해 둠.
  pwgl.FLOOR_VERTEX_POS_BUF_ITEM_SIZE = 3; // 버텍스 하나 당 필요한 좌표값 수 (gl.vertexAttribPointer()에 사용)
  pwgl.FLOOR_VERTEX_POS_BUF_NUM_ITEMS = 4; // 총 버텍스 수 (gl.drawElements() 에서는 floorVertexIndexBuffer.numberOfItems, 즉 인덱스 개수를 사용하므로 필요없긴 함.)

  // 바닥을 그릴 때 각 버텍스마다 사용할 텍스처 좌표값을 저장해 둘 WebGLBuffer 생성 -> 나중에 버텍스 셰이더의 애트리뷰트 변수에 쏴줄거임.
  pwgl.floorVertexTextureCoordinateBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexTextureCoordinateBuffer);
  const floorVertexTextureCoordinates = [
    // 각 버텍스마다 대응하는 텍스처 좌표를 지정해 둠.
    // 원래 텍스처 좌표는 (0.0, 0.0) ~ (1.0, 1.0) 사이의 값으로 지정됨.
    // 근데 이 범위를 벗어난 텍스처 좌표가 있다는 건, 텍스처보다 큰 기하 오브젝트에 대해서 하나의 텍스처를 여러 번 '래핑'하겠다는 뜻! 관련 정리 p.270 ~
    2.0,
    0.0, // v0
    2.0,
    2.0, // v1
    0.0,
    2.0, //v2
    0.0,
    0.0, // v3
  ];

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(floorVertexTextureCoordinates), // 위의 버텍스 텍스처 좌표 배열에 실수값만 들어가니 Float32Array 로 뷰타입 생성
    gl.STATIC_DRAW
  );

  // 마찬가지로 원래같으면 WebGLBuffer 객체에 넣어둘 값이지만 pwgl에 넣어둠.
  pwgl.FLOOR_VERTEX_TEX_COORD_BUF_ITEM_SIZE = 2; // 버텍스 하나 당 필요한 텍스처 좌표값 수
  pwgl.FLOOR_VERTEX_TEX_COORD_BUF_NUM_ITEMS = 4; // 총 텍스처 좌표 묶음 수

  // gl.drawElements()로 바닥을 그릴 때 사용할 버텍스 인덱스를 기록할 WebGLBuffer 생성
  pwgl.floorVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.floorVertexIndexBuffer); // gl.bufferData로 어떤 WebGLBuffer에 기록할건지 바인딩해줌.
  const floorVertexIndices = [0, 1, 2, 3];

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(floorVertexIndices), // 위에 인덱스 배열에는 정수값만 들어가니 Uint16Array로 뷰타입을 생성해야겠지!
    gl.STATIC_DRAW
  );

  // 원래같으면 WebGLBuffer 객체에 넣어둘 값들을 전역객체 pwgl에 분리하여 저장해 둠.
  pwgl.FLOOR_VERTEX_INDEX_BUF_ITEM_SIZE = 1; // 버텍스 하나를 가리키는 인덱스 수. 딱히 예제에서 사용하진 않음.
  pwgl.FLOOR_VERTEX_INDEX_BUF_NUM_ITEMS = 4; // 총 인덱스 수 (gl.drawElements() 에서 인덱스 개수로 사용함.)
}

// cube를 그릴 때 사용할 WebGLBuffer 객체들을 생성하는 함수. setupFloorBuffers() 함수에서 설명한 것과 내용은 거의 동일하므로 별도의 설명은 4-4 코드 정리 참고...
function setupCubeBuffers() {
  // 큐브의 버텍스 좌표 데이터를 담을 WebGLBuffer 생성
  pwgl.cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexPositionBuffer);

  const cubeVertexPosition = [
    // Front face
    1.0,
    1.0,
    1.0, //v0
    -1.0,
    1.0,
    1.0, //v1
    -1.0,
    -1.0,
    1.0, //v2
    1.0,
    -1.0,
    1.0, //v3

    // Back face
    1.0,
    1.0,
    -1.0, //v4
    -1.0,
    1.0,
    -1.0, //v5
    -1.0,
    -1.0,
    -1.0, //v6
    1.0,
    -1.0,
    -1.0, //v7

    // Left face
    -1.0,
    1.0,
    1.0, //v8
    -1.0,
    1.0,
    -1.0, //v9
    -1.0,
    -1.0,
    -1.0, //v10
    -1.0,
    -1.0,
    1.0, //v11

    // Right face
    1.0,
    1.0,
    1.0, //12
    1.0,
    -1.0,
    1.0, //13
    1.0,
    -1.0,
    -1.0, //14
    1.0,
    1.0,
    -1.0, //15

    // Top face
    1.0,
    1.0,
    1.0, //v16
    1.0,
    1.0,
    -1.0, //v17
    -1.0,
    1.0,
    -1.0, //v18
    -1.0,
    1.0,
    1.0, //v19

    // Bottom face
    1.0,
    -1.0,
    1.0, //v20
    1.0,
    -1.0,
    -1.0, //v21
    -1.0,
    -1.0,
    -1.0, //v22
    -1.0,
    -1.0,
    1.0, //v23
  ]; // 1.0 ~ -1.0 사이의 좌표값만 넣어줬지만, 이거는 클립좌표 기준으로 넣어준 게 절대 아님!! -> 즉, 버텍스 셰이더에서 투명 변환 해줘서 이 값들이 더 작은 값으로 변할거라는 뜻!

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cubeVertexPosition),
    gl.STATIC_DRAW
  );

  pwgl.CUBE_VERTEX_POS_BUF_ITEM_SIZE = 3;
  pwgl.CUBE_VERTEX_POS_BUF_NUM_ITEMS = 24;

  // 큐브에서 사용할 텍스처 좌표 데이터를 담는 WebGLBuffer 생성
  pwgl.cubeVertexTextureCoordinateBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexTextureCoordinateBuffer);
  const textureCoordinates = [
    //Front face
    0.0,
    0.0, //v0
    1.0,
    0.0, //v1
    1.0,
    1.0, //v2
    0.0,
    1.0, //v3

    // Back face
    0.0,
    1.0, //v4
    1.0,
    1.0, //v5
    1.0,
    0.0, //v6
    0.0,
    0.0, //v7

    // Left face
    0.0,
    1.0, //v8
    1.0,
    1.0, //v9
    1.0,
    0.0, //v10
    0.0,
    0.0, //v11

    // Right face
    0.0,
    1.0, //v12
    1.0,
    1.0, //v13
    1.0,
    0.0, //v14
    0.0,
    0.0, //v15

    // Top face
    0.0,
    1.0, //v16
    1.0,
    1.0, //v17
    1.0,
    0.0, //v18
    0.0,
    0.0, //v19

    // Bottom face
    0.0,
    1.0, //v20
    1.0,
    1.0, //v21
    1.0,
    0.0, //v22
    0.0,
    0.0, //v23
  ]; // 0.0 ~ 1.0 사이의 텍스처 좌표값만 사용하는 것으로 보아, 래핑은 안하겠군. 오브젝트와 카메라의 위치에 따라 텍스처 확대 또는 축소가 되겠군.

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(textureCoordinates),
    gl.STATIC_DRAW
  );

  pwgl.CUBE_VERTEX_TEX_COORD_BUF_ITEM_SIZE = 2;
  pwgl.CUBE_VERTEX_TEX_COORD_BUF_NUM_ITEMS = 24;

  // gl.drawElements() 메서드로 큐브를 그릴 때 사용할 버텍스 인덱스를 기록할 WebGLBuffer 생성
  pwgl.cubeVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.cubeVertexIndexBuffer);
  const cubeVertexIndices = [
    0,
    1,
    2,
    0,
    2,
    3, // Front face
    4,
    6,
    5,
    4,
    7,
    6, // Back face
    8,
    9,
    10,
    8,
    10,
    11, // Left face
    12,
    13,
    14,
    12,
    14,
    15, // Right face
    16,
    17,
    18,
    16,
    18,
    19, // Top face
    20,
    22,
    21,
    20,
    23,
    22, // Bottom face
  ];

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(cubeVertexIndices),
    gl.STATIC_DRAW
  );

  pwgl.CUBE_VERTEX_INDEX_BUF_ITEM_SIZE = 1;
  pwgl.CUBE_VERTEX_INDEX_BUF_NUM_ITEMS = 36;
  // 사실 큐브는 8개의 버텍스만으로도 충분히 그릴 수 있지만, 36개의 버텍스 인덱스를 사용하는 이유는?
  // 버텍스 색상 데이터와 마찬가지로 면마다 버텍스 텍스처 좌표 데이터를 각각 할당하기 위한 것!
}

function setupBuffers() {
  // floor와 cube에 필요한 WebGLBuffer들을 각각의 함수에서 따로 생성함. (코드가 길어져서 나눠놓은 듯...)
  setupFloorBuffers();
  setupCubeBuffers();
}

// 로딩이 끝난 이미지 객체와 텍스처 객체를 전달받은 뒤, 텍스처 바인딩 및 텍스처 데이터 전송 등 텍스처 사용에 필요한 나머지 작업들을 해주는 함수
function textureFinishedLoading(image, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture); // gl.bindBuffer()와 마찬가지로, 'WebGL 에게 지금부터 이 텍스처 객체를 사용할 겁니다' 라고 지정해주는 거임.

  // 이 메서드는 뭐냐면, gl.texImage2D()로 텍스처 데이터(이미지 객체)를 GPU에 전송하기 전에, 이미지를 수평축을 기준으로 FLIP Y, 즉 뒤집어주는 거임.
  // 왜 이렇게 해주냐면, 웹지엘 텍스처 좌표계와 HTML 이미지 객체의 좌표계가 수평죽을 기준으로 반대이기 때문에, 한 번 뒤집어주고 나서 전송해야 함. P.255 참고.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); // p.251에 각 인자에 대한 설명이 자세히 나와있음. 참고할 것.

  gl.generateMipmap(gl.TEXTURE_2D); // 축소 필터에서 밉맵 체인이 필요한 텍스처 필터링 방법을 지정하려면 이 메서드로 밉맵 체인을 자동 생성해야 함. 근데 이 예제에서는 딱히 밉맵 체인이 필요없는 것 같긴 한데...

  // gl.texParameteri()로 텍스처 필터링 방법을 지정함 p.268 ~ 269 참고
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // 텍스처 확대 시 필터링 방법 지정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); //  텍스처 축소 시 필터링 방법 지정

  // gl.texParameteri()로 텍스처 래핑 방법을 지정함 p.270 ~ 274 참고
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); // 텍스처 래핑 시 가로 방향 랩 모드 지정
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT); // 텍스처 래핑 시 세로 방향 랩 모드 지정

  gl.bindTexture(gl.TEXTURE_2D, null); // setupTextures() 함수에서 보듯, 3개의 텍스처 객체를 사용하니까, 다음 텍스처 객체를 바인딩하기 전, 마지막 줄에서 null을 바인딩해 초기화한 것 같음.

  /**
   * 텍스처 객체를 생성하고 로딩하는 절자는 p.254 ~ 256에 자세히 나와있으므로 참고할 것!
   */
}

// 웹지엘에서 텍스처를 사용하려면, 텍스처에 사용할 이미지, 즉 텍스처 데이터를 GPU에 로딩하는 작업이 필요한데,
// 여기에 필요한 Image 객체를 url을 인자로 전달받아서 만들어주는 함수임.
function loadImageForTexture(url, texture) {
  const image = new Image();
  image.onload = function () {
    // 이미지 로딩이 완료되면 호출할 이벤트핸들러 함수 할당
    pwgl.ongoingImageLoads.splice(pwgl.ongoingImageLoads.indexOf(image), 1); // 이미지 로딩이 완료된 이미지 객체는 pwgl.ongoingImageLoads 배열에서 splice로 제거해 줌.
    textureFinishedLoading(image, texture);
  };
  pwgl.ongoingImageLoads.push(image); // url을 넣어서 이미지 로딩을 시작하기 전, 로딩이 진행중인 이미지객체를 담아놓는 배열 pwgl.ongoingImageLoads 에 미리 넣어둠.
  image.src = url; // url을 넣어주는 순간 이미지가 이미지 객체로 비동기적으로 로드되기 시작함.
}

// 텍스처 객체(WebGLTexture)를 생성하는 함수 -> 여기서는 3개의 텍스처 이미지가 있으니 당연히 3개의 텍스처 객체를 만들어줘야 함.
function setupTextures() {
  // 테이블 텍스처 객체
  pwgl.woodTexture = gl.createTexture();
  loadImageForTexture("wood_128x128.jpg", pwgl.woodTexture); // WebGLTexture 객체를 생성하고 나면, 텍스처 사용에 필요한 이미지 객체를 만들어주는 함수를 호출함. (이 때, 이미지 url, 해당 텍스처 객체를 인자로 전달함)

  // 바닥 텍스처 객체
  pwgl.groundTexture = gl.createTexture();
  loadImageForTexture("wood_floor_256.jpg", pwgl.groundTexture);

  // 테이블 위 상자 텍스처 객체
  pwgl.boxTexture = gl.createTexture();
  loadImageForTexture("wicker_256.jpg", pwgl.boxTexture);
}

// 참고로 gl.uniformMatrix4fv()의 두 번째 인자는 만들어 온 모델뷰(또는 투영)행렬을 전치 여부를 물어보는 거임.
// glMatrix로 만든 행렬들은 모두 열 우선 행렬로 전치가 되어있는 상태므로 따로 전치할 필요가 없음. false로 하면 됨.
function uploadModelViewMatrixToShader() {
  // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uMVMatrix 유니폼 변수에 modelViewMatrix를 업로드함.
  gl.uniformMatrix4fv(pwgl.uniformMVMatrixLoc, false, pwgl.modelViewMatrix);
}

function uploadProjectionMatrixToShader() {
  // gl.uniformMatrix4fv() 메서드로 버텍스 셰이더의 uPMatrix 유니폼 변수에 modelViewMatrix를 업로드함.
  gl.uniformMatrix4fv(pwgl.uniformProjMatrixLoc, false, pwgl.projectionMatrix);
}

// 바닥을 그리는 함수
function drawFloor() {
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexPositionBuffer); // gl.vertexAttribPointer()로 어떤 WebGLBuffer에서 버텍스 데이터를 가져갈건지 정하기 위한 바인딩.
  gl.vertexAttribPointer(
    pwgl.vertexPositionAttributeLoc,
    pwgl.FLOOR_VERTEX_POS_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.floorVertexPositionBuffer에 기록된 버텍스 데이터를 aVertexPosition으로 가져올 방법을 정의함.

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.floorVertexTextureCoordinateBuffer); // 이번에는 텍스처 좌표 데이터가 담긴 WebGLBuffer에서 버텍스 데이터를 가져오겠군.
  gl.vertexAttribPointer(
    pwgl.vertexTextureAttributeLoc,
    pwgl.FLOOR_VERTEX_TEX_COORD_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.floorVertexTextureCoordinateBuffer에 기록된 각 버텍스별 텍스처 좌표 데이터를 aTextureCoordinates 로 가져올 방법을 정의함.

  gl.activeTexture(gl.TEXTURE0); // draw() 함수에서 지정해 준 텍스처 이미지 유닛을 사용하도록 명령하는 메서드
  gl.bindTexture(gl.TEXTURE_2D, pwgl.groundTexture); // 해당 텍스처 이미지 유닛에 바인딩하려는 WebGLTexture 객체를 전달함.

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.floorVertexIndexBuffer); // gl.drawElements() 메서드가 엘레먼트 배열 버퍼를 사용하려면, 먼저 해당 WebGLBuffer를 바인딩해줘야 함.
  gl.drawElements(
    gl.TRIANGLE_FAN,
    pwgl.FLOOR_VERTEX_INDEX_BUF_NUM_ITEMS,
    gl.UNSIGNED_SHORT, // 이거는 엘레먼트 배열 버퍼에 저장된 요소 인덱스의 타입을 지정하는 거라고 함.
    0
  );
}

function pushModelViewMatrix() {
  // 현재의 모델뷰행렬을 복사한 뒤, 복사본을 모델뷰행렬 스택에 push해놓는 함수
  const copyToPush = mat4.create(pwgl.modelViewMatrix);
  pwgl.modelViewMatrixStack.push(copyToPush);
}

function popModelViewMatrix() {
  if (pwgl.modelViewMatrixStack.length === 0) {
    // 만약 모델뷰행렬 스택이 비어있다면, 에러 메시지를 생성하고 프로그램을 중단함.
    // -> why? throw 연산자는 try...catch 블록 내에서 사용되지 않으면 예외 발생 시 스크립트가 죽어버림.
    throw "Error popModelViewMatrix() - Stack was empty";
  }

  // 가장 최근에 저장된 모델뷰행렬을 현재의 모델뷰행렬로 복구시킴.
  // pop() 메서드는 가장 마지막 item을 리턴해줌과 동시에 스택에서 마지막 item을 자동으로 제거해 줌.
  pwgl.modelViewMatrix = pwgl.modelViewMatrixStack.pop();
}

// 변형된 모델뷰행렬을 적용해서 다양한 크기와 모양의 큐브를 그리는 함수
function drawCube(texture) {
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexPositionBuffer); // gl.vertexAttribPointer()로 어떤 WebGLBuffer에서 버텍스 데이터를 가져갈건지 정하기 위한 바인딩.
  gl.vertexAttribPointer(
    pwgl.vertexPositionAttributeLoc,
    pwgl.CUBE_VERTEX_POS_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // cubeVertexPositionBuffer에 기록된 버텍스 데이터를 aVertexPosition으로 가져올 방법을 정의함.

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexTextureCoordinateBuffer); // 이번에는 텍스처 좌표 데이터가 담긴 WebGLBuffer에서 버텍스 데이터를 가져오겠군.
  gl.vertexAttribPointer(
    pwgl.vertexTextureAttributeLoc,
    pwgl.CUBE_VERTEX_TEX_COORD_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  ); // pwgl.cubeVertexTextureCoordinateBuffer에 기록된 각 버텍스별 텍스처 좌표 데이터를 aTextureCoordinates 로 가져올 방법을 정의함.

  gl.activeTexture(gl.TEXTURE0); // draw() 함수에서 지정해 준 텍스처 이미지 유닛을 사용하도록 명령하는 메서드
  gl.bindTexture(gl.TEXTURE_2D, texture); // 해당 텍스처 이미지 유닛에 바인딩하려는, 인자로 전달받은 WebGLTexture 객체를 전달함.

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.cubeVertexIndexBuffer); // gl.drawElements() 메서드가 엘레먼트 배열 버퍼를 사용하려면, 먼저 해당 WebGLBuffer를 바인딩해줘야 함.

  gl.drawElements(
    gl.TRIANGLE_FAN,
    pwgl.CUBE_VERTEX_INDEX_BUF_NUM_ITEMS,
    gl.UNSIGNED_SHORT,
    0
  );
}

function drawTable() {
  // 테이블 윗면 그리기
  pushModelViewMatrix(); // draw() 함수에서 이동변환이 적용된 모델뷰행렬을 또 저장함. -> drawTable() 함수 안에서만 계속 복구해서 사용할거임.
  mat4.translate(pwgl.modelViewMatrix, [0.0, 1.0, 0.0], pwgl.modelViewMatrix); // y축으로 올려주는 이동변환 적용
  mat4.scale(pwgl.modelViewMatrix, [2.0, 0.1, 2.0], pwgl.modelViewMatrix); // 테이블 윗면은 얇으면서 넓은 모양이 되도록 스케일 변환 적용
  uploadModelViewMatrixToShader(); // 모델뷰행렬이 바뀌면 버텍스 셰이더에 재업로드
  drawCube(pwgl.woodTexture); // 인자로 전달해 준 WebGLTexture 객체를 바인딩해서 큐브를 그려주는 함수
  popModelViewMatrix(); // 함수 첫번째 줄에서 저장해뒀던 모델뷰행렬을 다시 꺼내와서 복구시킴.

  // 테이블 다리 그리기
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      pushModelViewMatrix(); // 함수 첫번째 줄에서 저장했다가 다시 복구한 모델뷰행렬을 다시 스택에 저장해 둠.
      mat4.translate(
        pwgl.modelViewMatrix,
        [i * 1.9, -0.1, j * 1.9],
        pwgl.modelViewMatrix
      ); // 각 다리의 버텍스들을 y축으로 -0.1만큼 내리고, XZ축을 기준으로 -1.9 ~ 1.9 사이의 좌표값을 지정하도록 이동 변환 적용.
      mat4.scale(pwgl.modelViewMatrix, [0.1, 1.0, 0.1], pwgl.modelViewMatrix); // y축으로 길쭉한 모양이 되도록 XZ축 기준으로 0.1배 스케일링 변환 적용.
      uploadModelViewMatrixToShader(); // 모델뷰행렬이 바뀌면 버텍스 셰이더에 재업로드
      drawCube(pwgl.woodTexture); // 위에서 사용한 WebGLTexture와 동일한 텍스처로 큐브를 그려줌. (테이블 윗면과 테이블 다리는 같은 재질이니 텍스처도 동일하게 적용해야지!)
      popModelViewMatrix(); // 다음 반복문 넘어가서 새로운 다리를 그리기 전, 현재의 모델뷰행렬을 push해놓은 행렬(draw() 함수에서 y축으로 1.1만큼 이동시킨 거)로 복구함.
    }
  }

  /**
   * 여기서 기억할 점은,
   * 마지막 반복문에서 마지막 다리를 그려준 뒤,
   * popModelViewMatrix(); 해버리게 되면,
   *
   * 현재의 모델뷰 행렬은 draw() 함수에서 y축으로 1.1만큼 이동시킨 모델뷰 행렬로 복구되고,
   * 스택에는 카메라의 뷰 변환만 적용된 모델뷰 행렬만 남게 됨.
   *
   * 또 draw() 함수에서 drawTable() 호출하고 난 뒤,
   * popModelViewMatrix() 를 호출해버리면,
   * 결과적으로 현재 모델뷰행렬에는 뷰 변환만 적용된 모델뷰행렬로 복구가 될것임!
   * -> 여기서부터 다시 시작해서 모델뷰변환을 적용한 다음 테이블 위 큐브를 그리려는 것
   */
}

function draw() {
  // gl.viewport() 메서드를 이용하여 뷰포트 변환을 통해 윈도우 좌표값으로 변환해 줌. p.212 관련 내용 참고
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // gl.clear() 메서드는 비트연산자(|)를 이용해서 여러 개의 GLbitfield 파라미터를 받을 수 있음.

  // 초기 투영행렬(원근 투영행렬)을 만든 뒤, pwgl 전역객체안의 4*4 빈 행렬에 저장해 둠.
  mat4.perspective(
    60, // fov
    gl.canvas.width / gl.canvas.height, // aspect (종횡비 = 뷰포트 너비 / 뷰포트 높이)
    1, // near
    100.0, // far
    pwgl.projectionMatrix // 위의 4개 인자로 원근 투영행렬을 만든 뒤에 결과를 기록할 목적지 인자
  );

  // '뷰 변환 단계만' 적용해 준 초기 모델뷰 행렬을 생성함.
  mat4.identity(pwgl.modelViewMatrix); // 모델뷰 행렬 만들 때는 항상 단위행렬 초기화부터!
  mat4.lookAt([8, 5, -10], [0, 0, 0], [0, 1, 0], pwgl.modelViewMatrix);

  // 위에서 초기 투영행렬, 초기 모델뷰행렬을 만들었으므로, 항상 행렬을 새롭게 만들거나 수정하고 나면 버텍스 셰이더에 업로드하는 함수를 호출해줘야 함!
  uploadModelViewMatrixToShader();
  uploadProjectionMatrixToShader();

  // 프래그먼트 셰이더의 uSampler 유니폼 변수에 0을 넣어준 뒤, 사용할 텍스처 이미지 유닛을 gl.TEXTURE0 으로 지정함. (하단 정리 참고)
  gl.uniform1i(pwgl.uniformSamplerLoc, 0);

  // 바닥을 그리는 함수 호출
  drawFloor();

  // 테이블 그리기
  // 테이블을 그리기 전 초기 모델뷰행렬(뷰 변환만 적용)을 모델뷰행렬 스택에 저장해 둠. (커마레 변환만 적용된 초기값은 나중에 또 꺼내쓸 것이므로...)
  pushModelViewMatrix();
  mat4.translate(pwgl.modelViewMatrix, [0.0, 1.1, 0.0], pwgl.modelViewMatrix); // 버텍스들을 y축으로 1.1만큼 이동시키는 모델 변환 적용.
  uploadModelViewMatrixToShader(); // 모델뷰행렬이 바뀌었으니 버텍스 셰이더에 재업로드
  drawTable();
  popModelViewMatrix(); // drawTable() 함수의 마지막 코멘트처럼, 여기서 다시 pop 해주면 현재의 모델뷰행렬은 뷰 변환만 적용된 모델뷰 행렬로 복구됨.

  // 테이블 위 큐브 그리기
  pushModelViewMatrix(); // 뷰 변환만 적용된 모델뷰행렬을 스택에 저장해 둠
  mat4.translate(pwgl.modelViewMatrix, [0.0, 2.7, 0.0], pwgl.modelViewMatrix); // y축으로 2.7만큼 올린 이동변환 적용
  mat4.scale(pwgl.modelViewMatrix, [0.5, 0.5, 0.5], pwgl.modelViewMatrix); // drawCube() 함수 자체는 모서리가 2인 큐브를 그리므로, scale을 XYZ축 기준 0.5배로 변환 적용하면 모서리가 1인 큐브로 그려지겠군.
  uploadModelViewMatrixToShader(); // 모델뷰행렬이 바뀌었으니 버텍스 셰이더에 재업로드
  drawCube(pwgl.boxTexture); // 이번에는 테이블에서 썼던 것과는 다른 WebGLTexture 사용해서 큐브를 그림
  popModelViewMatrix(); // 현재 모델뷰행렬을 다시 뷰 변환만 적용된 모델뷰행렬로 복구시킴.

  pwgl.requestId = requestAnimFrame(draw, canvas); // 내부에서 애니메이션 루프 반복 호출
}

// 컨텍스트 상실이 발생했을 때 호출할 이벤트핸들러
function handleContextLost(e) {
  e.preventDefault(); // 'webglcontextlost' 이벤트가 발생하면, 기본적으로 컨텍스트를 복구하지 않는 기본 동작을 막아줌.
  cancelRequestAnimFrame(pwgl.requestId); // 진행중인 애니메이션 루프를 취소함.

  // 현재 로딩이 진행중인 이미지 객체들에 대해 반복문을 돌면서 onload에 할당된 이벤트핸들러를 제거한 뒤, 배열을 비워놓음.
  // 즉, 컨텍스트 상실이 발생한 순간에 로딩이 진행중인 이미지 객체들을 모두 취소한 것!
  for (let i = 0; i < pwgl.ongoingImageLoads.length; i++) {
    pwgl.ongoingImageLoads[i].onload = undefined;
  }
  pwgl.ongoingImageLoads = [];
}

// 컨텍스트가 복구되었을 때 호출할 이벤트핸들러
function handleContextRestored(e) {
  // 컨텍스트 복구 시 WebGL에서 처음 변경했던 설정과 리소스들이 기본값으로 초기화됨.
  // 이 함수에서는 이를 복원하기 위해 재설정 및 리소스 재생성을 진행함. -> startup() 함수에서 맨 처음 호출했던 작업들을 다시 해준거라고 보면 됨.
  setupShaders();
  setupBuffers();
  setupTextures();
  gl.clearColor(0.0, 0.0, 0.0, 1.0); // 초기화된 clearColor값도 재설정
  gl.enable(gl.DEPTH_TEST); // 깊이 버퍼 기능 활성화도 재설정
  pwgl.requestId = requestAnimFrame(draw, canvas); // 컨텍스트 상실 이벤트핸들러에서 취소했던 애니메이션 루프도 재개
}

function startup() {
  canvas = document.getElementById("myGLCanvas");
  canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas); // 원본 캔버스를 감싸는 wrapper를 생성해 'webglcontextlost'와 'webglcontextrestored' 이벤트를 시뮬레이션함.
  canvas.addEventListener("webglcontextlost", handleContextLost, false); // 컨텍스트 상실이 발생하면 호출할 이벤트핸들러 등록
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false); // 컨텍스트가 복구되면 호출할 이벤트핸들러 등록

  // 마우스 클릭 시 webglcontextlost 이벤트를 발생시키는 이벤트핸들러 등록
  // window.addEventListener("mousedown", function () {
  //   canvas.loseContext(); // 컨텍스트 상실을 시뮬레이션하는 webgl-debug 라이브러리 메서드
  // });

  gl = createGLContext(canvas);
  setupShaders();
  setupBuffers();
  setupTextures();
  gl.clearColor(0.0, 0.0, 0.0, 1.0); // 캔버스의 모든 픽셀을 gl.clear()로 초기화할 때의 색상을 black로 지정함.
  gl.enable(gl.DEPTH_TEST); // 3D 장면을 2D 색상 버퍼에 그릴 때는, 깊이 테스트 기능을 활성화해야 함.

  draw();
}

/**
 * 5-1 예제는
 * 4-4 예제에서 컨텍스트 상실 시뮬레이션 및 텍스처 사용을 위한 코드가 추가된 거라고 보면 됨.
 */

/**
 * WebGLTexture
 *
 * 이 웹지엘 텍스처 객체는 컨테이너 객체로써
 * 텍스처와 텍스처를 다루기 위한 설정들에 접근하는 데 사용함.
 */

/**
 * 텍스처 이미지 유닛을 사용하는 원리
 *
 * 가장 중요한 점은, WebGL 에서는 텍스처 작업을 할 때 항상 '하나의 텍스처만' 사용함.
 * 즉, 여러 개의 WebGLTexture 객체를 사용하더라도 텍스처 이미지 유닛은 하나만 사용한다는 것.
 *
 * 1. 이 때, 프래그먼트 셰이더의 uSampler 라는 sampler2D 타입의 유니폼 변수가 사용할 텍스처 이미지 유닛을 지정하려면,
 * gl.uniform1i(uSampler의 위치 정보가 담긴 WebGLUniformLocation 객체, 텍스처 이미지 유닛에 해당하는 번호) 이런 식으로 지정하면 됨.
 * 예를 들어, gl.uniform1i(WebGLUniformLocation, 0) 이렇게 하면,
 *
 * '프래그먼트 셰이더의 uSampler 변수는 gl.TEXTURE0 텍스쳐 이미지 유닛에 바인딩된 텍스처만 사용하겠다' 라는 뜻!
 *
 * 2. 이렇게 사용할 텍스처 이미지 유닛을 지정하고 나서, 지정된 텍스처 이미지 유닛을 지금 사용하고 싶다면,
 * gl.activeTexture(앞서 지정한 텍스처 이미지 유닛)을 호출하면 됨.
 * 예를 들어, gl.TEXTURE0 을 프래그먼트 셰이더에서 사용할 텍스처 이미지 유닛으로 지정해 놓았다면,
 * gl.activeTexture(gl.TEXTURE0) 요렇게 하면 현재 사용할 텍스처 이미지 유닛을 gl.TEXTURE0 으로 하겠다는 뜻.
 * 만약 이 메서드를 별도로 호출하지 않으면 기본적으로 gl.TEXTURE0 을 사용하도록 약속되어 있음.
 *
 * 3. 그리고 나서 해당 텍스처 이미지 유닛에 어떤 텍스처 객체를 바인딩해서 사용하게 할 것인지는
 * gl.bindTexture(gl.TEXTURE_2D, 바인딩할 WebGLTexture)로 해주면 됨.
 *
 * gl.TEXTURE0 을 기준으로 순서정리!
 * 1. gl.uniform1i(WebGLUniformLocation, 0) (참고로, uniformli가 아니고, uniform1i 임. 영어 l이 아니라 숫자 1이 맞음!)
 * 2. gl.activeTexture(gl.TEXTURE0)
 * 3. gl.bindTexture(gl.TEXTURE_2D, 바인딩할 WebGLTexture)
 */
