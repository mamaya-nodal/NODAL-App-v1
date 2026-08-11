# Modulos de negocio

Cada carpeta dentro de `modules/` representa un area funcional de NODAL.

Las reglas economicas se escriben en `domain/` como funciones deterministas y
testeables. Los componentes visuales pueden usar esas funciones, pero no
redefinir sus reglas.

Primer modulo: `control-diario`, porque contiene reglas confirmadas que pueden
probarse sin base de datos ni informacion real.
