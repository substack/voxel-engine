var THREE = require('three')
var voxel = require('voxel')
var voxelMesh = require('voxel-mesh')

module.exports = Detached

function Detached (game) {
  this.meshes = []
  this.refs = {}
  this.game = game
}

function createEmptyChunk () {
  var low = [0,0,0], high = [32,32,32]
  var zeros = function (x,y,z) { return 0 }
  return voxel.generate(low, high, zeros)
}

Detached.prototype.create = function (chunk) {
  var self = this
  var game = self.game
  var size = game.cubeSize
  var scale = new THREE.Vector3(size, size, size)
  
  var r = new THREE.Object3D
  var t = new THREE.Object3D
  var inner = new THREE.Object3D
  
  inner.add(r)
  t.add(inner)
  
  inner.position.x = size / 2
  inner.position.z = size / 2
  
  var ref = {
    rotationObject: r,
    translationObject: t,
    rotation: r.rotation,
    position: t.position,
    chunk: chunk,
    update: update
  }
  
  function update () {
    var mesh = voxelMesh(chunk, voxel.meshers.greedy, scale)
    if (ref.mesh) {
      var s = ref.mesh.surfaceMesh || ref.mesh.wireMesh
      var ix = self.meshes.indexOf(s)
      if (ix >= 0) self.meshes.splice(s, ix)
      delete self.refs[s.id]
      r.remove(s)
    }
    ref.mesh = mesh
    
    if (game.meshType === 'wireMesh') {
      mesh.createWireMesh()
    } else {
      mesh.createSurfaceMesh(game.material)
    }
    
    var surface = mesh.surfaceMesh || mesh.wireMesh
    surface.position.x = -size / 2
    surface.position.z = -size / 2
    r.add(surface)
    
    game._materialEngine.applyTextures(mesh.geometry)
    
    self.meshes.push(surface)
    self.refs[surface.id] = ref
  }
  
  ref.update()
  
  game.scene.add(t)
  
  return ref
}
