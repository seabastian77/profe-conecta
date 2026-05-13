require("dotenv").config();
const app = require("./src/app");
const { migrar } = require("./src/config/migrate");

const PORT = process.env.PORT || 3000;

migrar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 ConectaProfe corriendo en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Error al iniciar:', err);
    process.exit(1);
  });
