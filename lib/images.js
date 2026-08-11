'use strict';

const useCloud = !!(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

let cloudinary = null;
if (useCloud) {
  cloudinary = require('cloudinary').v2;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  // Se for CLOUDINARY_URL, o SDK le a variavel de ambiente sozinho.
}

// Envia uma foto (ficheiro temporario local) para o Cloudinary e devolve o
// URL publico + o id interno (necessario para conseguir apagar a foto mais
// tarde). So e chamada quando useCloud e verdadeiro.
async function uploadImage(localFilePath, folder) {
  const result = await cloudinary.uploader.upload(localFilePath, {
    folder: `cec-catalogo/${folder}`,
    resource_type: 'image',
  });
  return { url: result.secure_url, publicId: result.public_id };
}

async function deleteImage(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId).catch(() => {});
}

module.exports = { useCloud, uploadImage, deleteImage };
