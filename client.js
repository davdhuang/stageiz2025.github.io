document.getElementById("uploadForm").addEventListener("submit", function (e) {
    e.preventDefault();
  
    // Créer un objet FormData pour envoyer le fichier
    let formData = new FormData();
    formData.append("pdfFile", document.querySelector('input[type="file"]').files[0]);
  
    // Envoi du fichier au serveur via fetch
    fetch("/upload", {
      method: "POST",
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      // Afficher le fichier téléchargé sur la page
      const fileUrl = data.fileUrl;
  
      // Afficher un message de succès
      document.getElementById("status").textContent = `Fichier uploadé avec succès !`;
  
      // Afficher le PDF téléchargé dans la page
      const fileDisplayArea = document.getElementById("fileDisplayArea");
      const iframe = document.createElement("iframe");
      iframe.src = fileUrl;  // L'URL du fichier téléchargé
      iframe.width = "600";   // Largeur du PDF dans l'iframe
      iframe.height = "800";  // Hauteur du PDF dans l'iframe
      fileDisplayArea.innerHTML = ""; // Effacer tout contenu précédent
      fileDisplayArea.appendChild(iframe); // Ajouter l'iframe à l'écran
    })
    .catch(error => {
      // Afficher un message d'erreur
      document.getElementById("status").textContent = `Erreur : ${error.message}`;
    });
  });
  