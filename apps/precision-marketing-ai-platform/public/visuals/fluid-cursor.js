(function exposeFluidCursorEngine(global) {
  const SHADERS = {
    vertex: `
      precision highp float;
      varying vec2 vUv;
      attribute vec2 a_position;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 u_texel;

      void main () {
        vUv = .5 * (a_position + 1.);
        vL = vUv - vec2(u_texel.x, 0.);
        vR = vUv + vec2(u_texel.x, 0.);
        vT = vUv + vec2(0., u_texel.y);
        vB = vUv - vec2(0., u_texel.y);
        gl_Position = vec4(a_position, 0., 1.);
      }
    `,
    advection: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_velocity_texture;
      uniform sampler2D u_input_texture;
      uniform vec2 u_texel;
      uniform float u_dt;

      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }

      void main () {
        vec2 coord = vUv - u_dt * bilerp(u_velocity_texture, vUv, u_texel).xy * u_texel;
        gl_FragColor = .96 * bilerp(u_input_texture, coord, u_texel);
        gl_FragColor.a = 1.;
      }
    `,
    divergence: `
      precision highp float;
      precision highp sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D u_velocity_texture;

      void main () {
        float L = texture2D(u_velocity_texture, vL).x;
        float R = texture2D(u_velocity_texture, vR).x;
        float T = texture2D(u_velocity_texture, vT).y;
        float B = texture2D(u_velocity_texture, vB).y;
        float div = .6 * (R - L + T - B);
        gl_FragColor = vec4(div, 0., 0., 1.);
      }
    `,
    pressure: `
      precision highp float;
      precision highp sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D u_pressure_texture;
      uniform sampler2D u_divergence_texture;

      void main () {
        float L = texture2D(u_pressure_texture, vL).x;
        float R = texture2D(u_pressure_texture, vR).x;
        float T = texture2D(u_pressure_texture, vT).x;
        float B = texture2D(u_pressure_texture, vB).x;
        float divergence = texture2D(u_divergence_texture, vUv).x;
        float pressure = (L + R + B + T - divergence) * .25;
        gl_FragColor = vec4(pressure, 0., 0., 1.);
      }
    `,
    gradientSubtract: `
      precision highp float;
      precision highp sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D u_pressure_texture;
      uniform sampler2D u_velocity_texture;

      void main () {
        float L = texture2D(u_pressure_texture, vL).x;
        float R = texture2D(u_pressure_texture, vR).x;
        float T = texture2D(u_pressure_texture, vT).x;
        float B = texture2D(u_pressure_texture, vB).x;
        vec2 velocity = texture2D(u_velocity_texture, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0., 1.);
      }
    `,
    splat: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_input_texture;
      uniform float u_ratio;
      uniform vec3 u_point_value;
      uniform vec2 u_point;
      uniform float u_point_size;

      void main () {
        vec2 p = vUv - u_point.xy;
        p.x *= u_ratio;
        vec3 splat = pow(2., -dot(p, p) / u_point_size) * u_point_value;
        vec3 base = texture2D(u_input_texture, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.);
      }
    `,
    output: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_output_texture;

      void main () {
        vec3 color = texture2D(u_output_texture, vUv).rgb;
        gl_FragColor = vec4(vec3(1.) - color, 1.);
      }
    `,
  };

  function createContext(canvas) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl || !gl.getExtension("OES_texture_float")) return null;

    const compileShader = (source, type) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(SHADERS.vertex, gl.VERTEX_SHADER);
    if (!vertexShader) return null;

    const createProgram = (fragmentSource) => {
      const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
      if (!fragmentShader) return null;
      const program = gl.createProgram();
      if (!program) return null;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, "a_position");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

      const uniforms = {};
      const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let index = 0; index < uniformCount; index += 1) {
        const info = gl.getActiveUniform(program, index);
        if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms };
    };

    const programs = {
      splat: createProgram(SHADERS.splat),
      divergence: createProgram(SHADERS.divergence),
      pressure: createProgram(SHADERS.pressure),
      gradientSubtract: createProgram(SHADERS.gradientSubtract),
      advection: createProgram(SHADERS.advection),
      output: createProgram(SHADERS.output),
    };
    if (!Object.values(programs).every(Boolean)) return null;

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
      gl.STATIC_DRAW
    );
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 2, 0, 2, 3]),
      gl.STATIC_DRAW
    );
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    const createFBO = (width, height, format = gl.RGBA) => {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.FLOAT, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        fbo,
        width,
        height,
        attach(textureId) {
          gl.activeTexture(gl.TEXTURE0 + textureId);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return textureId;
        },
      };
    };

    const createDoubleFBO = (width, height, format = gl.RGBA) => {
      let first = createFBO(width, height, format);
      let second = createFBO(width, height, format);
      return {
        width,
        height,
        texelSizeX: 1 / width,
        texelSizeY: 1 / height,
        read: () => first,
        write: () => second,
        swap() {
          [first, second] = [second, first];
        },
      };
    };

    const blit = (target) => {
      if (target) {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      } else {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    return { gl, programs, createFBO, createDoubleFBO, blit };
  }

  function mount(canvas, options = {}) {
    const color = options.color || { r: 0.412, g: 0.694, b: 1 };
    const context = createContext(canvas);
    if (!context) return function noop() {};

    const { gl, programs, createFBO, createDoubleFBO, blit } = context;
    const uniform = (program, name) => program.uniforms[name] || null;
    const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false };
    let isPreview = false;
    let hasPointer = false;
    let pointerSize = 4 / global.innerHeight;
    let animationFrame = 0;
    let outputColor;
    let velocity;
    let divergenceFBO;
    let pressure;

    const initFBOs = () => {
      const width = Math.max(1, Math.floor(0.25 * canvas.width));
      const height = Math.max(1, Math.floor(0.25 * canvas.height));
      outputColor = createDoubleFBO(width, height);
      velocity = createDoubleFBO(width, height);
      divergenceFBO = createFBO(width, height, gl.RGB);
      pressure = createDoubleFBO(width, height, gl.RGB);
    };

    const resize = () => {
      pointerSize = 4 / global.innerHeight;
      canvas.width = Math.max(1, global.innerWidth);
      canvas.height = Math.max(1, global.innerHeight);
      initFBOs();
    };

    const updatePointer = (x, y) => {
      pointer.moved = true;
      pointer.dx = 5 * (x - pointer.x);
      pointer.dy = 5 * (y - pointer.y);
      pointer.x = x;
      pointer.y = y;
    };

    const handlePointerMove = (event) => {
      isPreview = false;
      if (!hasPointer) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        hasPointer = true;
        return;
      }
      updatePointer(event.clientX, event.clientY);
    };

    const handleTouchMove = (event) => {
      isPreview = false;
      const touch = event.targetTouches[0];
      if (!touch) return;
      if (!hasPointer) {
        pointer.x = touch.clientX;
        pointer.y = touch.clientY;
        hasPointer = true;
        return;
      }
      updatePointer(touch.clientX, touch.clientY);
    };

    const render = (time) => {
      const dt = 1 / 60;

      if (time && isPreview) {
        const x =
          0.5 +
          0.25 * Math.sin(0.0017 * time) +
          0.12 * Math.sin(0.0031 * time + 1.3) +
          0.08 * Math.cos(0.0053 * time + 2.7) +
          0.05 * Math.sin(0.0079 * time + 4.1);
        const y =
          0.5 +
          0.18 * Math.sin(0.0023 * time + 0.5) +
          0.12 * Math.cos(0.0041 * time + 1.8) +
          0.08 * Math.sin(0.0067 * time + 3.2) +
          0.05 * Math.cos(0.0089 * time + 5);
        updatePointer(x * global.innerWidth, y * global.innerHeight);
      }

      if (pointer.moved) {
        if (!isPreview) pointer.moved = false;
        const splat = programs.splat;
        gl.useProgram(splat.program);
        gl.uniform1i(uniform(splat, "u_input_texture"), velocity.read().attach(1));
        gl.uniform1f(uniform(splat, "u_ratio"), canvas.width / canvas.height);
        gl.uniform2f(
          uniform(splat, "u_point"),
          pointer.x / canvas.width,
          1 - pointer.y / canvas.height
        );
        gl.uniform3f(uniform(splat, "u_point_value"), pointer.dx, -pointer.dy, 1);
        gl.uniform1f(uniform(splat, "u_point_size"), pointerSize);
        blit(velocity.write());
        velocity.swap();

        gl.uniform1i(uniform(splat, "u_input_texture"), outputColor.read().attach(1));
        gl.uniform3f(
          uniform(splat, "u_point_value"),
          1 - color.r,
          1 - color.g,
          1 - color.b
        );
        blit(outputColor.write());
        outputColor.swap();
      }

      const divergence = programs.divergence;
      gl.useProgram(divergence.program);
      gl.uniform2f(
        uniform(divergence, "u_texel"),
        velocity.texelSizeX,
        velocity.texelSizeY
      );
      gl.uniform1i(
        uniform(divergence, "u_velocity_texture"),
        velocity.read().attach(1)
      );
      blit(divergenceFBO);

      const pressureProgram = programs.pressure;
      gl.useProgram(pressureProgram.program);
      gl.uniform2f(
        uniform(pressureProgram, "u_texel"),
        velocity.texelSizeX,
        velocity.texelSizeY
      );
      gl.uniform1i(
        uniform(pressureProgram, "u_divergence_texture"),
        divergenceFBO.attach(1)
      );
      for (let iteration = 0; iteration < 4; iteration += 1) {
        gl.uniform1i(
          uniform(pressureProgram, "u_pressure_texture"),
          pressure.read().attach(2)
        );
        blit(pressure.write());
        pressure.swap();
      }

      const gradientSubtract = programs.gradientSubtract;
      gl.useProgram(gradientSubtract.program);
      gl.uniform2f(
        uniform(gradientSubtract, "u_texel"),
        velocity.texelSizeX,
        velocity.texelSizeY
      );
      gl.uniform1i(
        uniform(gradientSubtract, "u_pressure_texture"),
        pressure.read().attach(1)
      );
      gl.uniform1i(
        uniform(gradientSubtract, "u_velocity_texture"),
        velocity.read().attach(2)
      );
      blit(velocity.write());
      velocity.swap();

      const advection = programs.advection;
      gl.useProgram(advection.program);
      gl.uniform2f(
        uniform(advection, "u_texel"),
        velocity.texelSizeX,
        velocity.texelSizeY
      );
      gl.uniform1i(
        uniform(advection, "u_velocity_texture"),
        velocity.read().attach(1)
      );
      gl.uniform1i(
        uniform(advection, "u_input_texture"),
        velocity.read().attach(1)
      );
      gl.uniform1f(uniform(advection, "u_dt"), dt);
      blit(velocity.write());
      velocity.swap();

      gl.uniform2f(
        uniform(advection, "u_texel"),
        outputColor.texelSizeX,
        outputColor.texelSizeY
      );
      gl.uniform1i(
        uniform(advection, "u_input_texture"),
        outputColor.read().attach(2)
      );
      blit(outputColor.write());
      outputColor.swap();

      const output = programs.output;
      gl.useProgram(output.program);
      gl.uniform1i(
        uniform(output, "u_output_texture"),
        outputColor.read().attach(1)
      );
      blit(null);
      animationFrame = global.requestAnimationFrame(render);
    };

    resize();
    global.addEventListener("resize", resize);
    global.addEventListener("pointermove", handlePointerMove, { passive: true });
    global.addEventListener("touchmove", handleTouchMove, { passive: true });
    animationFrame = global.requestAnimationFrame(render);

    return () => {
      global.removeEventListener("resize", resize);
      global.removeEventListener("pointermove", handlePointerMove);
      global.removeEventListener("touchmove", handleTouchMove);
      global.cancelAnimationFrame(animationFrame);
    };
  }

  global.FluidCursorEngine = { mount };
})(window);
