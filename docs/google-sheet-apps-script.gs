/**
 * Cards-Trading — Easter Egg OG email collection
 *
 * SETUP (5 minutes) :
 * 1. Crée une nouvelle Google Sheet (sheets.new)
 * 2. Renomme-la "Cards Trading - OG Members"
 * 3. Dans la première ligne (en-têtes), mets :
 *    A1: Date | B1: Email | C1: Easter Egg | D1: User Agent | E1: Referrer
 * 4. Menu "Extensions" > "Apps Script"
 * 5. Supprime le code par défaut, colle ce fichier complet
 * 6. Sauvegarde (Ctrl+S)
 * 7. Clique "Déployer" > "Nouveau déploiement"
 *    - Type : "Application Web"
 *    - Description : "Cards Trading OG endpoint"
 *    - Exécuter en tant que : "Moi"
 *    - Qui a accès : "Tout le monde"
 * 8. Clique "Déployer" puis "Autoriser l'accès" (ton compte Google)
 * 9. Copie l'URL fournie (https://script.google.com/macros/s/.../exec)
 * 10. Donne-moi cette URL : je la mets dans easter-eggs.js
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    // Validation basique
    if (!data.email || !data.easterEgg) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: 'Missing email or easterEgg' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Vérifier les doublons (même email, même egg) pour éviter spam
    const range = sheet.getDataRange().getValues();
    const isDuplicate = range.some(row =>
      row[1] === data.email && row[2] === data.easterEgg
    );

    if (isDuplicate) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: 'Already registered', duplicate: true })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Append nouvelle entrée
    sheet.appendRow([
      new Date().toISOString(),
      String(data.email).trim().toLowerCase(),
      data.easterEgg,
      data.userAgent || '',
      data.referrer || ''
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: String(error) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      service: 'Cards-Trading OG Easter Egg endpoint',
      status: 'live',
      message: 'POST your easter egg discoveries here'
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
