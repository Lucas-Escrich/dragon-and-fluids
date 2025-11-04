/****************************
 * dragon.js (integración con fluids.js)
 * Requiere: #fluidCanvas + #dragonCanvas y que fluids.js se cargue antes.
 ****************************/
(() => {
  // ====== INPUT ======
  const Input = {
    keys: Array(230).fill(false),
    mouse: { left: false, right: false, middle: false, x: 0, y: 0 }
  };
  document.addEventListener("keydown", e => { Input.keys[e.keyCode] = true; });
  document.addEventListener("keyup",   e => { Input.keys[e.keyCode] = false; });
  document.addEventListener("mousedown", e => {
    if (e.button === 0) Input.mouse.left = true;
    if (e.button === 1) Input.mouse.middle = true;
    if (e.button === 2) Input.mouse.right = true;
  });
  document.addEventListener("mouseup", e => {
    if (e.button === 0) Input.mouse.left = false;
    if (e.button === 1) Input.mouse.middle = false;
    if (e.button === 2) Input.mouse.right = false;
  });
  document.addEventListener("mousemove", e => {
    Input.mouse.x = e.clientX;
    Input.mouse.y = e.clientY;
  });
  document.addEventListener("contextmenu", e => e.preventDefault());

  // ====== CANVAS DEL DRAGÓN ======
  const dragonCanvas = document.getElementById("dragonCanvas");
  const dctx = dragonCanvas.getContext("2d");

  function resizeDragon() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dragonCanvas.width  = Math.floor(window.innerWidth  * dpr);
    dragonCanvas.height = Math.floor(window.innerHeight * dpr);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.strokeStyle = "white";
    dctx.lineWidth = 1 * dpr;
  }
  window.addEventListener("resize", resizeDragon);
  resizeDragon();

  // ====== CLASES (idénticas a tu lógica, usando dctx) ======
  let segmentCount = 0;
  class Segment {
    constructor(parent, size, angle, range, stiffness) {
      segmentCount++;
      this.isSegment = true;
      this.parent = parent;
      if (typeof parent.children == "object") parent.children.push(this);
      this.children = [];
      this.size = size;
      this.relAngle = angle;
      this.defAngle = angle;
      this.absAngle = parent.absAngle + angle;
      this.range = range;
      this.stiffness = stiffness;
      this.updateRelative(false, true);
    }
    updateRelative(iter, flex) {
      this.relAngle = this.relAngle - 2 * Math.PI *
        Math.floor((this.relAngle - this.defAngle) / (2 * Math.PI) + 0.5);
      if (flex) {
        this.relAngle = Math.min(
          this.defAngle + this.range / 2,
          Math.max(
            this.defAngle - this.range / 2,
            (this.relAngle - this.defAngle) / this.stiffness + this.defAngle
          )
        );
      }
      this.absAngle = this.parent.absAngle + this.relAngle;
      this.x = this.parent.x + Math.cos(this.absAngle) * this.size;
      this.y = this.parent.y + Math.sin(this.absAngle) * this.size;
      if (iter) for (let i = 0; i < this.children.length; i++) this.children[i].updateRelative(iter, flex);
    }
    draw(iter) {
      dctx.beginPath();
      dctx.moveTo(this.parent.x, this.parent.y);
      dctx.lineTo(this.x, this.y);
      dctx.stroke();
      if (iter) for (let i = 0; i < this.children.length; i++) this.children[i].draw(true);
    }
    follow(iter) {
      const x = this.parent.x, y = this.parent.y;
      const dist = Math.hypot(this.x - x, this.y - y);
      this.x = x + (this.size * (this.x - x)) / dist;
      this.y = y + (this.size * (this.y - y)) / dist;
      this.absAngle = Math.atan2(this.y - y, this.x - x);
      this.relAngle = this.absAngle - this.parent.absAngle;
      this.updateRelative(false, true);
      if (iter) for (let i = 0; i < this.children.length; i++) this.children[i].follow(true);
    }
  }

  class LimbSystem {
    constructor(end, length, speed, creature) {
      this.end = end;
      this.length = Math.max(1, length);
      this.creature = creature;
      this.speed = speed;
      creature.systems.push(this);
      this.nodes = [];
      let node = end;
      for (let i = 0; i < length; i++) {
        this.nodes.unshift(node);
        node = node.parent;
        if (!node.isSegment) { this.length = i + 1; break; }
      }
      this.hip = this.nodes[0].parent;
    }
    moveTo(x, y) {
      this.nodes[0].updateRelative(true, true);
      let dist = Math.hypot(x - this.end.x, y - this.end.y);
      let len = Math.max(0, dist - this.speed);
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const node = this.nodes[i];
        const ang = Math.atan2(node.y - y, node.x - x);
        node.x = x + len * Math.cos(ang);
        node.y = y + len * Math.sin(ang);
        x = node.x; y = node.y; len = node.size;
      }
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        node.absAngle = Math.atan2(node.y - node.parent.y, node.x - node.parent.x);
        node.relAngle = node.absAngle - node.parent.absAngle;
        for (let ii = 0; ii < node.children.length; ii++) {
          const childNode = node.children[ii];
          if (!this.nodes.includes(childNode)) childNode.updateRelative(true, false);
        }
      }
    }
    update() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.moveTo(Input.mouse.x * dpr, Input.mouse.y * dpr);
    }
  }

  class LegSystem extends LimbSystem {
    constructor(end, length, speed, creature) {
      super(end, length, speed, creature);
      this.goalX = end.x; this.goalY = end.y;
      this.step = 0; this.forwardness = 0;
      this.reach = 0.9 * Math.hypot(this.end.x - this.hip.x, this.end.y - this.hip.y);
      let relAngle = this.creature.absAngle - Math.atan2(this.end.y - this.hip.y, this.end.x - this.hip.x);
      relAngle -= 2 * Math.PI * Math.floor(relAngle / (2 * Math.PI) + 0.5);
      this.swing = -relAngle + (relAngle < 0 ? -1 : 1) * Math.PI / 2;
      this.swingOffset = this.creature.absAngle - this.hip.absAngle;
    }
    update() {
      this.moveTo(this.goalX, this.goalY);
      if (this.step === 0) {
        const dist = Math.hypot(this.end.x - this.goalX, this.end.y - this.goalY);
        if (dist > 1) {
          this.step = 1;
          this.goalX = this.hip.x + this.reach * Math.cos(this.swing + this.hip.absAngle + this.swingOffset) + (2*Math.random()-1)*this.reach/2;
          this.goalY = this.hip.y + this.reach * Math.sin(this.swing + this.hip.absAngle + this.swingOffset) + (2*Math.random()-1)*this.reach/2;
        }
      } else if (this.step === 1) {
        const theta = Math.atan2(this.end.y - this.hip.y, this.end.x - this.hip.x) - this.hip.absAngle;
        const dist = Math.hypot(this.end.x - this.hip.x, this.end.y - this.hip.y);
        const forwardness2 = dist * Math.cos(theta);
        const dF = this.forwardness - forwardness2;
        this.forwardness = forwardness2;
        if (dF * dF < 1) {
          this.step = 0;
          this.goalX = this.hip.x + (this.end.x - this.hip.x);
          this.goalY = this.hip.y + (this.end.y - this.hip.y);
        }
      }
    }
  }

  class Creature {
    constructor(x,y,angle,fAccel,fFric,fRes,fThresh,rAccel,rFric,rRes,rThresh) {
      this.x=x; this.y=y; this.absAngle=angle;
      this.fSpeed=0; this.fAccel=fAccel; this.fFric=fFric; this.fRes=fRes; this.fThresh=fThresh;
      this.rSpeed=0; this.rAccel=rAccel; this.rFric=rFric; this.rRes=rRes; this.rThresh=rThresh;
      this.children=[]; this.systems=[];
    }
    follow(x,y) {
      const dist = Math.hypot(this.x - x, this.y - y);
      const angle = Math.atan2(y - this.y, x - this.x);
      let accel = this.fAccel;
      if (this.systems.length > 0) {
        let sum = 0; for (let i=0;i<this.systems.length;i++) sum += (this.systems[i].step == 0);
        accel *= sum / this.systems.length;
      }
      this.fSpeed += accel * (dist > this.fThresh);
      this.fSpeed *= 1 - this.fRes;
      this.speed = Math.max(0, this.fSpeed - this.fFric);

      let dif = this.absAngle - angle;
      dif -= 2 * Math.PI * Math.floor(dif / (2 * Math.PI) + 0.5);
      if (Math.abs(dif) > this.rThresh && dist > this.fThresh) this.rSpeed -= this.rAccel * (dif > 0 ? 1 : -1);
      this.rSpeed *= 1 - this.rRes;
      if (Math.abs(this.rSpeed) > this.rFric) this.rSpeed -= this.rFric * (this.rSpeed > 0 ? 1 : -1);
      else this.rSpeed = 0;

      this.absAngle += this.rSpeed;
      this.absAngle -= 2 * Math.PI * Math.floor(this.absAngle / (2 * Math.PI) + 0.5);
      this.x += this.speed * Math.cos(this.absAngle);
      this.y += this.speed * Math.sin(this.absAngle);

      this.absAngle += Math.PI;
      for (let i=0;i<this.children.length;i++) this.children[i].follow(true, true);
      for (let i=0;i<this.systems.length;i++) this.systems[i].update();
      this.absAngle -= Math.PI;

      this.draw(true);
    }
    draw(iter) {
      const r = 4;
      dctx.beginPath();
      dctx.arc(this.x, this.y, r, Math.PI/4 + this.absAngle, 7*Math.PI/4 + this.absAngle);
      dctx.moveTo(this.x + r*Math.cos(7*Math.PI/4 + this.absAngle), this.y + r*Math.sin(7*Math.PI/4 + this.absAngle));
      dctx.lineTo(this.x + r*Math.cos(this.absAngle)*Math.SQRT2, this.y + r*Math.sin(this.absAngle)*Math.SQRT2);
      dctx.lineTo(this.x + r*Math.cos(Math.PI/4 + this.absAngle), this.y + r*Math.sin(Math.PI/4 + this.absAngle));
      dctx.stroke();
      if (iter) for (let i=0;i<this.children.length;i++) this.children[i].draw(true);
    }
  }

  // ====== Construcción del “dragón” ======
  let critter;
  (function setupLizard() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const s = 8 / Math.sqrt(Math.max(1, Math.floor(1 + Math.random() * 12)));
    const legs = Math.floor(1 + Math.random() * 12);
    const tail = Math.floor(4 + Math.random() * legs * 8);

    critter = new Creature(
      (window.innerWidth * dpr) / 2,
      (window.innerHeight * dpr) / 2,
      0, s*10, s*2, 0.5, 16, 0.5, 0.085, 0.5, 0.3
    );

    let spinal = critter;
    // Cuello
    for (let i=0;i<6;i++) {
      spinal = new Segment(spinal, s*4, 0, (Math.PI*2)/3, 1.1);
      for (let ii=-1; ii<=1; ii+=2) {
        let node = new Segment(spinal, s*3, ii, 0.1, 2);
        for (let iii=0; iii<3; iii++) node = new Segment(node, s*0.1, -ii*0.1, 0.1, 2);
      }
    }
    // Torso + patas
    for (let i=0;i<legs;i++) {
      if (i>0) {
        for (let ii=0; ii<6; ii++) {
          spinal = new Segment(spinal, s*4, 0, 1.571, 1.5);
          for (let iii=-1; iii<=1; iii+=2) {
            let node = new Segment(spinal, s*3, iii*1.571, 0.1, 1.5);
            for (let iv=0; iv<3; iv++) node = new Segment(node, s*3, -iii*0.3, 0.1, 2);
          }
        }
      }
      for (let ii=-1; ii<=1; ii+=2) {
        let node = new Segment(spinal, s*12, ii*0.785, 0, 8);
        node = new Segment(node, s*16, -ii*0.785, 6.28, 1);
        node = new Segment(node, s*16, ii*1.571, 3.1415, 2);
        for (let iii=0; iii<4; iii++) new Segment(node, s*4, (iii/3 - 0.5)*1.571, 0.1, 4);
        new LegSystem(node, 3, s*12, critter, 4);
      }
    }
    // Cola
    for (let i=0;i<tail;i++) {
      spinal = new Segment(spinal, s*4, 0, (Math.PI*2)/3, 1.1);
      for (let ii=-1; ii<=1; ii+=2) {
        let node = new Segment(spinal, s*3, ii, 0.1, 2);
        for (let iii=0; iii<3; iii++) node = new Segment(node, (s*3*(tail - i))/tail, -ii*0.1, 0.1, 2);
      }
    }
  })();

  // ====== Emisión al fluido ======
  const fluidCanvas = document.getElementById("fluidCanvas");
  let prevX = critter.x, prevY = critter.y, distAccum = 0;
  const MIN_PIXEL_STEP = 8;      // separa los splats
  const FORCE_SCALE   = 1200;    // fuerza a velocidad
  let trailColor = null;

  function pickFluidColor() {
    try { return typeof generateColor === "function" ? generateColor() : { r:0.15, g:0.15, b:0.15 }; }
    catch { return { r:0.15, g:0.15, b:0.15 }; }
  }

  function loop() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dctx.clearRect(0, 0, dragonCanvas.width, dragonCanvas.height);

    // mover y dibujar
    critter.follow(Input.mouse.x * dpr, Input.mouse.y * dpr);

    // emitir “splat” según desplazamiento del hocico
    const x = critter.x, y = critter.y;
    const dx = x - prevX, dy = y - prevY;
    distAccum += Math.hypot(dx, dy);

    if (distAccum >= MIN_PIXEL_STEP && typeof splat === "function" && fluidCanvas) {
      const nx  = fluidCanvas.width  ? x / fluidCanvas.width  : 0.5;
      const ny  = fluidCanvas.height ? 1 - (y / fluidCanvas.height) : 0.5;
      const ndx = (fluidCanvas.width  ? dx / fluidCanvas.width  : 0) * FORCE_SCALE;
      const ndy = (fluidCanvas.height ? -dy / fluidCanvas.height : 0) * FORCE_SCALE;

      if (!trailColor) trailColor = pickFluidColor();
      try { splat(nx, ny, ndx, ndy, trailColor); } catch {}

      if (distAccum > MIN_PIXEL_STEP * 4) trailColor = pickFluidColor();
      distAccum = 0;
    }

    prevX = x; prevY = y;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
