var voxel = require('voxel')
var voxelMesh = require('voxel-mesh')
if (process.browser) var interact = require('interact')
var Detector = require('./detector')
var THREE = require('three')
var Stats = require('./stats')
var playerPhysics = require('player-physics')
var requestAnimationFrame = require('raf')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter

module.exports = Game

function Game(opts) {
  if (!(this instanceof Game)) return new Game(opts)
  var self = this
  if (!opts) opts = {}
  if (process.browser && this.notCapable()) return
  if (opts.generate) {
    this.generateVoxelChunk = function(low, high) {
      return voxel.generate(low, high, opts.generate)
    }
  } else this.generateVoxelChunk = opts.generateVoxelChunk
  
  this.THREE = THREE
  this.texturePath = opts.texturePath || '/textures/'
  this.cubeSize = opts.cubeSize || 25
  this.chunkSize = opts.chunkSize || 32
  this.chunkDistance = opts.chunkDistance || 2
  this.setConfigurablePositions(opts)
  this.meshType = opts.meshType || 'surfaceMesh'
  this.controlOptions = opts.controlOptions || {}
  if (opts.renderCallback) this.renderCallback = opts.renderCallback
  this.materials = opts.materials || [ 'grass' ]
  this.items = []
  this.voxels = voxel(this)
  this.voxels.generateMissingChunks(this.worldOrigin)
  
  // client side only (todo: use better pattern than this)
  if (process.browser) {
    this.initializeRendering()
    Object.keys(this.voxels.chunks).map(function(chunkIndex) {
      self.showChunk(self.voxels.chunks[chunkIndex])
    })
  }
}

inherits(Game, EventEmitter)

Game.prototype.initializeRendering = function() {
  var self = this
  this.material = this.loadTextures(this.materials)
  this.height = window.innerHeight
  this.width = window.innerWidth
  this.scene = scene = new THREE.Scene()
  this.camera = this.createCamera(scene)
  this.renderer = this.createRenderer()
  this.addLights(this.scene)
  if (!this.statsDisabled) this.addStats()
  this.controls = this.createControls()
  this.moveToPosition(this.startingPosition)
  window.addEventListener('resize', this.onWindowResize.bind(this), false)
  window.addEventListener('mousedown', this.onMouseDown.bind(this), false)
  window.addEventListener('mouseup', this.onMouseUp.bind(this), false)
  requestAnimationFrame(window).on('data', this.tick.bind(this))
}

Game.prototype.parseVectorOption = function(vector) {
  if (!vector) return
  if (vector.length && typeof vector.length === 'number') return new THREE.Vector3(vector[0], vector[1], vector[2])
  if (typeof vector === 'object') return new THREE.Vector3(vector.x, vector.y, vector.z)
}

Game.prototype.setConfigurablePositions = function(opts) {
  var sp = opts.startingPosition
  if (sp) sp = this.parseVectorOption(sp)
  this.startingPosition = sp || new THREE.Vector3(35,1024,35)
  var wo = opts.worldOrigin
  if (wo) wo = this.parseVectorOption(wo)
  this.worldOrigin = wo || new THREE.Vector3(0,0,0)
}

Game.prototype.notCapable = function() {
  if( !Detector().webgl ) {
    var wrapper = document.createElement('div')
    wrapper.className = "errorMessage"
    var a = document.createElement('a')
    a.title = "You need WebGL and Pointer Lock (Chrome 23/Firefox 14) to play this game. Click here for more information."
    a.innerHTML = a.title
    a.href = "http://get.webgl.org"
    wrapper.appendChild(a)
    this.element = wrapper
    return true
  }
  return false
}

Game.prototype.setupPointerLock = function(element) {
  var self = this
  element = element || document.body
  if (typeof element !== 'object') element = document.querySelector(element)
  var pointer = this.pointer = interact(element)
  if (!pointer.pointerAvailable()) this.pointerLockDisabled = true
  pointer.on('attain', function(movements) {
    self.controls.enabled = true
    movements.pipe(self.controls)
  })
  pointer.on('release', function() {
    self.controls.enabled = false
  })
  pointer.on('error', function() {
    // user denied pointer lock OR it's not available
    self.pointerLockDisabled = true
    console.error('pointerlock error')
  })
}

Game.prototype.requestPointerLock = function(element) {
  if (!this.pointer) this.setupPointerLock(element)
  this.pointer.request()
}

Game.prototype.moveToPosition = function(position) {
  var pos = this.controls.yawObject.position
  pos.x = position.x
  pos.y = position.y
  pos.z = position.z
}

Game.prototype.onWindowResize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight
  this.camera.updateProjectionMatrix()
  this.renderer.setSize( window.innerWidth, window.innerHeight )
}

Game.prototype.addMarker = function(position) {
  var geometry = new THREE.SphereGeometry( 1, 4, 4 );
  var material = new THREE.MeshPhongMaterial( { color: 0xffffff, shading: THREE.FlatShading } );
  var mesh = new THREE.Mesh( geometry, material );
  mesh.position.copy(position)
  this.scene.add(mesh)
}

Game.prototype.addItem = function(item) {
  var self = this
  self.items.push(item)
  item.velocity = item.velocity || { x: 0, y: 0, z: 0 }
  item.collisionRadius = item.collisionRadius || item.size
  if (!item.width) item.width = item.size
  if (!item.height) item.height = item.size
  if (!item.depth) item.depth = item.width
  
  var ticker = item.tick
  item.tick = function (dt) {
    if (item.collisionRadius) {
      var p0 = self.controls.yawObject.position.clone()
      var p1 = self.controls.yawObject.position.clone()
      p1.y -= 25
      var d0 = distance(item.mesh.position, p0)
      var d1 = distance(item.mesh.position, p1)
      if (Math.min(d0, d1) <= item.collisionRadius) {
        self.emit('collision', item)
      }
    }
    
    if (!item.resting) {
      var c = self.getCollisions(item.mesh.position, item)
      if (c.bottom.length > 0) {
        if (item.velocity.y <= 0) {
          item.mesh.position.y -= item.velocity.y
          item.velocity.y = 0
          item.resting = true
        }
        item.velocity.x = 0
        item.velocity.z = 0
      } else if (c.middle.length || c.top.length) {
        item.velocity.x *= -1
        item.velocity.z *= -1
      }

      item.velocity.y -= 0.003
      item.mesh.position.x += item.velocity.x * dt
      item.mesh.position.y += item.velocity.y * dt
      item.mesh.position.z += item.velocity.z * dt
    }
    
    if (ticker) ticker(item)
  }
  self.scene.add(item.mesh)
}

Game.prototype.removeItem = function(item) {
  var ix = this.items.indexOf(item)
  if (ix < 0) return
  this.items.splice(ix, 1)
  this.scene.remove(item.mesh)
}

Game.prototype.onMouseDown = function(e) {
  if (!this.controls.enabled) return
  var intersection = this.raycast()
  if (intersection) this.emit('mousedown', intersection, e)
}

Game.prototype.onMouseUp = function(e) {
  if (!this.controls.enabled) return
  var intersection = this.raycast()
  if (intersection) this.emit('mouseup', intersection, e)
}

Game.prototype.intersectAllMeshes = function(start, direction) {
  var self = this
  var meshes = []
  Object.keys(self.voxels.meshes).map(function(key) {
    meshes.push(self.voxels.meshes[key][self.meshType])
  })
  var d = direction.subSelf(start).normalize()
  var ray = new THREE.Raycaster(start, d)
  var intersections = ray.intersectObjects( meshes )
  if (intersections.length === 0) return false
  var intersection = intersections[0]
  var p = new THREE.Vector3()
  p.copy(intersection.point)
  p.x += d.x
  p.y += d.y
  p.z += d.z
  return p
}

Game.prototype.raycast = function() {
  var start = this.controls.yawObject.position.clone()
  var direction = this.camera.matrixWorld.multiplyVector3(new THREE.Vector3(0,0,-1))
  var intersects = this.intersectAllMeshes(start, direction)
  return intersects
}

Game.prototype.loadTextures = function(names) {
  var self = this
  return new THREE.MeshFaceMaterial(names.map(function (name) {
    var tex = THREE.ImageUtils.loadTexture(self.texturePath + name + ".png")
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.LinearMipMapLinearFilter
    tex.wrapT = THREE.RepeatWrapping
    tex.wrapS = THREE.RepeatWrapping
    
    return new THREE.MeshLambertMaterial({
      map: tex,
      ambient: 0xbbbbbb
    })
  }))
}

Game.prototype.createCamera = function() {
  var camera;
  camera = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 10000)
  camera.lookAt(new THREE.Vector3(0, 0, 0))
  this.scene.add(camera)
  return camera
}

Game.prototype.createControls = function() {
  var controls = playerPhysics(this.camera, this.controlOptions)
  this.bindWASD(controls)
  this.scene.add( controls.yawObject )
  return controls
}

Game.prototype.createRenderer = function() {
  this.renderer = new THREE.WebGLRenderer({
    antialias: true
  })
  this.renderer.setSize(this.width, this.height)
  this.renderer.setClearColorHex(0xBFD1E5, 1.0)
  this.renderer.clear()
  this.element = this.renderer.domElement
  return this.renderer
}

Game.prototype.appendTo = function (element) {
  if (typeof element === 'object') {
    element.appendChild(this.element)
  }
  else {
    document.querySelector(element).appendChild(this.element)
  }
}

Game.prototype.addStats = function() {
  stats = new Stats()
  stats.domElement.style.position  = 'absolute'
  stats.domElement.style.bottom  = '0px'
  document.body.appendChild( stats.domElement )
}

Game.prototype.cameraRotation = function() {
  var xAngle = this.controls.pitchObject.rotation.x
  var yAngle = this.controls.yawObject.rotation.y
  return {x: xAngle, y: yAngle}
}

Game.prototype.getCollisions = function(position, dims, checker) {
  var self = this
  var p = position.clone()
  var w = dims.width / 2
  var h = dims.height / 2
  var d = dims.depth / 2

  var vertices = {
    bottom: [
      new THREE.Vector3(p.x - w, p.y - h, p.z - d),
      new THREE.Vector3(p.x - w, p.y - h, p.z + d),
      new THREE.Vector3(p.x + w, p.y - h, p.z - d),
      new THREE.Vector3(p.x + w, p.y - h, p.z + d)
    ],
    middle: [
      new THREE.Vector3(p.x - w, p.y, p.z - d),
      new THREE.Vector3(p.x - w, p.y, p.z + d),
      new THREE.Vector3(p.x + w, p.y, p.z - d),
      new THREE.Vector3(p.x + w, p.y, p.z + d)
    ],
    top: [
      new THREE.Vector3(p.x - w, p.y + h, p.z - d),
      new THREE.Vector3(p.x - w, p.y + h, p.z + d),
      new THREE.Vector3(p.x + w, p.y + h, p.z - d),
      new THREE.Vector3(p.x + w, p.y + h, p.z + d)
    ],
  }

  return {
    bottom: vertices.bottom.map(check).filter(Boolean),
    middle: vertices.middle.map(check).filter(Boolean),
    top: vertices.top.map(check).filter(Boolean)
  }
  
  function check(vertex) {
    if (checker) return checker(vertex) && vertex
    var val = self.voxels.voxelAtPosition(vertex)
    return val && vertex
  }
}

Game.prototype.addLights = function(scene) {
  var ambientLight, directionalLight
  ambientLight = new THREE.AmbientLight(0xaaaaaa)
  scene.add(ambientLight)
  var light	= new THREE.DirectionalLight( 0xffffff )
  light.position.set( Math.random(), Math.random(), Math.random() ).normalize()
  scene.add( light )
};

Game.prototype.currentMesh = function() {
  var cid = this.voxels.chunkAtPosition(this.controls.yawObject.position).join('|')
  return this.voxels.meshes[cid]
}

Game.prototype.checkBlock = function(pos) {
  var self = this
  var direction = self.camera.matrixWorld.multiplyVector3(new THREE.Vector3(0,0,-1))
  var start = self.controls.yawObject.position.clone()
  var d = direction.subSelf(start).normalize()
  
  var p = new THREE.Vector3()
  p.copy(pos)
  p.x -= 1.1 * d.x
  p.y -= 1.1 * d.y
  p.z -= 1.1 * d.z
  var block = self.getBlock(p)
  if (block) return false
  
  var vidx = self.voxels.voxelIndex(p)
  var c = self.voxels.chunkAtPosition(p)
  var ckey = c.join('|')
  var chunk = self.voxels.chunks[ckey]
  if (!chunk) return false
  
  var pos = self.controls.yawObject.position
  var collisions = self.getCollisions(pos, {
    width: self.cubeSize / 2,
    depth: self.cubeSize / 2,
    height: self.cubeSize * 1.5
  }, check)
  
  if (collisions.top.length) return false
  if (collisions.middle.length) return false
  if (collisions.bottom.length > 2) return false
  
  function check(v) { return vidx === self.voxels.voxelIndex(v) }
  
  return {chunkIndex: c.join('|'), voxelVector: self.voxels.voxelVector(p)}
}

Game.prototype.createBlock = function(pos, val) {
  var newBlock = this.checkBlock(pos)
  if (!newBlock) return
  var chunk = this.voxels.chunks[newBlock.chunkIndex]
  chunk.voxels[this.voxels.voxelIndex(newBlock.voxelVector)] = val
  this.showChunk(chunk)
  return true
  
}

Game.prototype.setBlock = function(pos, val) {
  var hitVoxel = this.voxels.voxelAtPosition(pos, val)
  var c = this.voxels.chunkAtPosition(pos)
  this.showChunk(this.voxels.chunks[c.join('|')])
}

Game.prototype.getBlock = function(pos) {
  return this.voxels.voxelAtPosition(pos)
}

Game.prototype.showChunk = function(chunk) {
  var chunkIndex = chunk.position.join('|')
  var bounds = this.voxels.getBounds.apply(this.voxels, chunk.position)
  var cubeSize = this.cubeSize
  var scale = new THREE.Vector3(cubeSize, cubeSize, cubeSize)
  var mesh = voxelMesh(chunk, scale)
  this.voxels.chunks[chunkIndex] = chunk
  if (this.voxels.meshes[chunkIndex]) this.scene.remove(this.voxels.meshes[chunkIndex][this.meshType])
  this.voxels.meshes[chunkIndex] = mesh
  if (this.meshType === 'wireMesh') mesh.createWireMesh()
  else mesh.createSurfaceMesh(this.material)
  mesh.setPosition(bounds[0][0] * cubeSize, bounds[0][1] * cubeSize, bounds[0][2] * cubeSize)
  mesh.addToScene(this.scene)
  this.applyTextures(mesh.geometry)
  this.items.forEach(function (item) { item.resting = false })
  return mesh
}

Game.prototype.applyTextures = function (geom) {
  var self = this;
  
  geom.faces.forEach(function (face, ix) {
    var c = face.vertexColors[0]
    var index = Math.floor(c.b*255 + c.g*255*255 + c.r*255*255*255)
    face.materialIndex = Math.max(0, index - 1) % self.materials.length
  })
}

Game.prototype.updatePlayerPhysics = function(controls) {
  var pos = controls.yawObject.position.clone()
  pos.y -= this.cubeSize * 1.5 / 2
  
  var collisions = this.getCollisions(pos, {
    width: this.cubeSize / 2,
    depth: this.cubeSize / 2,
    height: this.cubeSize * 1.5
  })
  
  if (collisions.middle.length) {
    controls.yawObject.translateX(-controls.velocity.x)
    controls.yawObject.translateZ(-controls.velocity.z)
    controls.velocity.x *= -0.01
    controls.velocity.z *= -0.01
  }
  
  if (collisions.top.length) {
    controls.yawObject.translateY(-controls.velocity.y)
    controls.velocity.y = Math.min(0, controls.velocity.y)
  }
  
  if (collisions.bottom.length) {
    controls.velocity.y = Math.max(0, controls.velocity.y)
  }
}

Game.prototype.bindWASD = function (controls) {
  var self = this
  var onKeyDown = function ( event ) {
    switch ( event.keyCode ) {
      case 38: // up
      case 87: // w
        controls.emit('command', 'moveForward', true)
        break

      case 37: // left
      case 65: // a
        controls.emit('command', 'moveLeft', true)
        break

      case 40: // down
      case 83: // s
        controls.emit('command', 'moveBackward', true)
        break

      case 39: // right
      case 68: // d
        controls.emit('command', 'moveRight', true)
        break

      case 32: // space
        controls.emit('command', 'jump')
        break;
    }
  }

  var onKeyUp = function ( event ) {
    switch( event.keyCode ) {
      case 38: // up
      case 87: // w
        controls.emit('command', 'moveForward', false)
        break

      case 37: // left
      case 65: // a
        controls.emit('command', 'moveLeft', false)
        break

      case 40: // down
      case 83: // a
        controls.emit('command', 'moveBackward', false)
        break

      case 39: // right
      case 68: // d
        controls.emit('command', 'moveRight', false)
        break
    }
  };

  document.addEventListener( 'keydown', onKeyDown, false )
  document.addEventListener( 'keyup', onKeyUp, false )
}

Game.prototype.tick = function(delta) {
  this.controls.tick(delta, this.updatePlayerPhysics.bind(this))
  this.items.forEach(function (item) { item.tick(delta) })
  this.emit('tick', delta)
  this.renderer.render(this.scene, this.camera)
  stats.update()
}

function distance (a, b) {
  var x = a.x - b.x
  var y = a.y - b.y
  var z = a.z - b.z
  return Math.sqrt(x*x + y*y + z*z)
}
