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

// Ficheiros diversos (etiquetas, documentos anexados a uma peca, etc.) podem
// ser fotos OU outro tipo de ficheiro (PDF, Word, Excel...). Fotos vao como
// "image"; qualquer outra coisa vai como "raw" - NAO usar "auto"/"image"
// para PDFs, porque por omissao o Cloudinary bloqueia o download direto de
// PDFs enviados como "image" (uma proteção de segurança da conta) e o
// ficheiro fica por abrir. Como "raw" não passa pelo pipeline de imagens,
// essa restrição não se aplica.
// "deliveryType" escolhe como o ficheiro fica acessivel no Cloudinary:
//  - "upload": o link e publico. Quem o tiver, abre-o sem precisar de entrar
//    no site. Serve para as fotos das pecas (uma foto de uma peca na
//    prateleira nao e informacao sensivel) e mantem o carregamento rapido,
//    porque o browser vai busca-las diretamente ao CDN.
//  - "authenticated": o link so funciona acompanhado de uma assinatura
//    gerada com a chave secreta da conta. E o que se usa para os ficheiros
//    anexados as pecas (dumps de centralinas, faturas, manuais), para que um
//    link que escape - reencaminhado, no historico do browser - deixe de dar
//    acesso a nada. Nao custa nada, faz parte da API normal do Cloudinary.
async function uploadFile(localFilePath, folder, mimeType, deliveryType = 'upload') {
  const resourceType = mimeType && mimeType.startsWith('image/') ? 'image' : 'raw';
  const result = await cloudinary.uploader.upload(localFilePath, {
    folder: `cec-catalogo/${folder}`,
    resource_type: resourceType,
    type: deliveryType,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    deliveryType: result.type || deliveryType,
  };
}

async function deleteFile(publicId, resourceType, deliveryType) {
  if (!publicId) return;
  await cloudinary.uploader
    .destroy(publicId, { resource_type: resourceType || 'image', type: deliveryType || 'upload' })
    .catch(() => {});
}

// Gera o link assinado que o servidor usa para ir buscar um ficheiro
// guardado como "authenticated". So quem tem a chave secreta da conta
// consegue gerar esta assinatura, por isso o endereco normal (sem ela) deixa
// de dar acesso a nada.
//
// Este link nao expira, mas isso nao e problema porque ele nunca sai do
// servidor: e criado, usado para ir buscar o ficheiro, e deitado fora. O que
// chega ao browser e sempre o proprio ficheiro, servido pela rota /download
// que exige sessao iniciada.
function signedUrlFor(publicId, resourceType, deliveryType) {
  return cloudinary.url(publicId, {
    resource_type: resourceType || 'image',
    type: deliveryType || 'upload',
    secure: true,
    sign_url: true,
  });
}

// Mantidos por compatibilidade com o resto do código (repositório de etiquetas).
const uploadLabelFile = (localFilePath, folder, mimeType) => uploadFile(localFilePath, `etiquetas/${folder}`, mimeType);
const deleteLabelFile = deleteFile;

// Ficheiros anexados a uma peça do catálogo (manuais, faturas, esquemas,
// dumps de centralinas) - os mais sensíveis, por isso vão como
// "authenticated" e são sempre servidos através do próprio site.
const uploadPartFile = (localFilePath, partId, fileId, mimeType) =>
  uploadFile(localFilePath, `pecas/${partId}/ficheiros/${fileId}`, mimeType, 'authenticated');
const deletePartFile = deleteFile;

module.exports = {
  useCloud,
  uploadImage,
  deleteImage,
  uploadLabelFile,
  deleteLabelFile,
  uploadPartFile,
  deletePartFile,
  signedUrlFor,
};
