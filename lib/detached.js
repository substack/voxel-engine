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

Detached.prototype.create = function (chunks) {
  var self = this
  var game = self.game
  var size = game.cubeSize
  var csize = size * game.chunkSize
  var scale = new THREE.Vector3(size, size, size)
  
  if (!chunks) chunks = { '0|0|0': createEmptyChunk() }
  
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
    chunks: chunks,
    meshes: {},
    update: update,
    set: function (ci, vi, value) {
      var ckey = typeof ci === 'object' ? ci.join('|') : ci
      if (!ref.chunks[ckey]) ref.chunks[ckey] = createEmptyChunk()
      ref.chunks[ckey].voxels[vi] = value
      update(ckey)
    },
    get: function (ci, vi) {
      var ckey = typeof ci === 'object' ? ci.join('|') : ci
      if (!ref.chunks[ckey]) return undefined
      return ref.chunks[ckey].voxels[vi]
    }
  }
  
  function update (ci) {
    var ckey = typeof ci === 'object' ? ci.join('|') : ci
    var chunk = ref.chunks[ckey]
    if (!chunk) return
    
    var mesh = voxelMesh(chunk, voxel.meshers.greedy, scale)
    
    if (ref.meshes[ckey]) {
      var s = ref.meshes[ckey].surfaceMesh || ref.meshes[ckey].wireMesh
      var ix = self.meshes.indexOf(s)
      if (ix >= 0) self.meshes.splice(ix, 1)
      delete self.refs[s.id]
      r.remove(s)
    }
    ref.meshes[ckey] = mesh
    
    if (game.meshType === 'wireMesh') {
      mesh.createWireMesh()
    } else {
      mesh.createSurfaceMesh(game.material)
    }
    
    var surface = mesh.surfaceMesh || mesh.wireMesh
    surface.position.x = -size / 2
    surface.position.z = -size / 2
    
    var xyz = ckey.split('|')
    surface.position.x += xyz[0] * csize
    surface.position.y += xyz[1] * csize
    surface.position.z += xyz[2] * csize
    
    r.add(surface)
    
    game._materialEngine.applyTextures(mesh.geometry)
    
    self.meshes.push(surface)
    self.refs[surface.id] = ref
  }
  
  ref.update('0|0|0')
  game.scene.add(t)
  
  return ref
}
