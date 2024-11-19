// Sistema de Gestión de Inventario de Libros

let inventario = [];
let ultimoId = 0;

// Generar ID consecutivo
export function generarId() {
    ultimoId++;
    return ultimoId;
}

// Agregar libro al inventario
export function agregarLibro(titulo, autor, categoria, precio, stock) {
    const libro = {
        id: generarId(),
        titulo,
        autor,
        categoria,
        precio,
        stock,
        valorTotal: precio * stock
    };
    inventario.push(libro);
    return libro;
}

// Modificar un libro existente
export function modificarLibro(id, nuevoPrecio, nuevoStock) {
    const libro = inventario.find(l => l.id === id);
    if (libro) {
        libro.precio = nuevoPrecio;
        libro.stock = nuevoStock;
        libro.valorTotal = nuevoPrecio * nuevoStock;
    }
}

// Eliminar un libro
export function eliminarLibro(id) {
    const index = inventario.findIndex(l => l.id === id);
    if (index !== -1) {
        inventario.splice(index, 1);
    }
}

// Listar libros
export function listarLibros() {
    return [...inventario];
}

// Validar existencia de un libro
export function validarLibro(id) {
    return inventario.some(l => l.id === id);
}