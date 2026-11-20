var sequelize = require("./sequelizeConnection");
const { DataTypes } = require("sequelize");

var rpaCombustibles = sequelize.define("rpaCombustibles", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  fechaIngreso: {
    type: DataTypes.CHAR(10),
    field: 'fecha_ingreso',
    allowNull: true
  },
  factura: {
    type: DataTypes.STRING(50),
    field: 'factura',
    allowNull: true
  },
  gd: {
    type: DataTypes.STRING(50),
    field: 'gd',
    allowNull: true
  },
  empresa: {
    type: DataTypes.STRING(100),
    field: 'empresa',
    allowNull: true
  },
  nEmpresa: {
    type: DataTypes.INTEGER,
    field: 'n_empresa',
    allowNull: true
  },
  fechaProceso: {
    type: DataTypes.CHAR(10),
    field: 'fecha_proceso',
    allowNull: true
  },
  centroConsumo: {
    type: DataTypes.INTEGER,
    field: 'centro_consumo',
    allowNull: true
  },
  rutProveedor: {
    type: DataTypes.STRING(20),
    field: 'rut_proveedor',
    allowNull: true
  },
  contacto: {
    type: DataTypes.STRING(100),
    field: 'contacto',
    allowNull: true
  },
  glosa: {
    type: DataTypes.TEXT,
    field: 'glosa',
    allowNull: true
  },
  nSolicitudIdForms: {
    type: DataTypes.STRING(50),
    field: 'n_solicitud_id_forms',
    allowNull: true
  },
  solicitante: {
    type: DataTypes.STRING(150),
    field: 'solicitante',
    allowNull: true
  },
  aprobador: {
    type: DataTypes.STRING(150),
    field: 'aprobador',
    allowNull: true
  },
  formaPago: {
    type: DataTypes.STRING(100),
    field: 'forma_pago',
    allowNull: true
  },
  tipoProyecto: {
    type: DataTypes.INTEGER,
    field: 'tipo_proyecto',
    allowNull: true
  },
  nProyecto: {
    type: DataTypes.INTEGER,
    field: 'n_proyecto',
    allowNull: true
  },
  tipoDocumento: {
    type: DataTypes.STRING(100),
    field: 'tipo_documento',
    allowNull: true
  },
  numeroDocumento: {
    type: DataTypes.STRING(50),
    field: 'numero_documento',
    allowNull: true
  },
  codigoProducto: {
    type: DataTypes.STRING(50),
    field: 'codigo_producto',
    allowNull: true
  },
  cantidadComprar: {
    type: DataTypes.DECIMAL(12, 2),
    field: 'cantidad_comprar',
    allowNull: true
  },
  bodega: {
    type: DataTypes.INTEGER,
    field: 'bodega',
    allowNull: true
  },
  precioUnitarioNeto: {
    type: DataTypes.DECIMAL(15, 4),
    field: 'precio_unitario_neto',
    allowNull: true
  },
  codigoIE: {
    type: DataTypes.INTEGER,
    field: 'codigo_ie',
    allowNull: true
  },
  ieReal: {
    type: DataTypes.DECIMAL(10, 4),
    field: 'ie_real',
    allowNull: true
  },
  nOC: {
    type: DataTypes.INTEGER,
    field: 'nroOc',
    allowNull: true
  }
}, {
  tableName: "rpaCombustibles"
});
//sequelize.sync({ alter: true });

try {
  sequelize.sync();
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = rpaCombustibles;
