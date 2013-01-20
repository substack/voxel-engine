var THREE = require('three')

module.exports = Detached

function Detached (game) {
  this.meshes = []
  this.game = game
}

Detached.prototype.create = function (mesh) {
  var game = this.game
  var r = new THREE.Object3D
  var t = new THREE.Object3D
  var inner = new THREE.Object3D
  
  if (game.meshType === 'wireMesh') {
    mesh.createWireMesh()
  } else {
    mesh.createSurfaceMesh(game.material)
  }
  
  var size = game.cubeSize
  var surface = mesh.surfaceMesh || mesh.wireMesh
  surface.position.x = -size / 2
  surface.position.z = -size / 2
  
  inner.position.x = size / 2
  inner.position.z = size / 2
  
  this.meshes.push(surface)
  r.add(surface)
  inner.add(r)
  t.add(inner)
  
  game.scene.add(t)
  game._materialEngine.applyTextures(mesh.geometry)
   
  return {
    rotationObject: r,
    translationObject: t,
    rotation: r.rotation,
    position: t.position
  }
}
