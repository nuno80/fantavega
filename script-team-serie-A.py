# pip install google-colab-selenium requests pillow

import os
import time
import requests
import re
import google_colab_selenium as gs
from selenium.webdriver.common.by import By
from PIL import Image
from io import BytesIO

# --- CONFIGURAZIONE ---
MAIN_FOLDER = 'serie_a_full'
LARGHEZZA_MAX = 500
MIN_DIMENSION = 100
QUALITA_WEBP = 80

# Mappatura Nome -> Slug URL
# Lo slug è la parte finale dell'indirizzo web (es: /team/hellas-verona/squadra)
TEAMS = {
    'Atalanta': 'atalanta',
    'Bologna': 'bologna',
    'Cagliari': 'cagliari',
    'Como': 'como',
    'Cremonese': 'cremonese',
    'Fiorentina': 'fiorentina',
    'Genoa': 'genoa',
    'Hellas Verona': 'hellas-verona',
    'Inter': 'inter',
    'Juventus': 'juventus',
    'Lazio': 'lazio',
    'Lecce': 'lecce',
    'Milan': 'milan',
    'Napoli': 'napoli',
    'Parma': 'parma',
    'Pisa': 'pisa',
    'Roma': 'roma',
    'Sassuolo': 'sassuolo',
    'Torino': 'torino',
    'Udinese': 'udinese'
}

# --- FUNZIONI DI UTILITÀ ---
def pulisci_slug_giocatore(url_href):
    if not url_href: return None
    slug = url_href.split('/')[-1]
    return re.sub(r'-\d+$', '', slug) # Rimuove ID numerico finale

def salva_se_valida(img_data, percorso_file):
    try:
        image = Image.open(BytesIO(img_data))
        # Filtro dimensione minima (evita icone)
        if image.width < MIN_DIMENSION or image.height < MIN_DIMENSION:
            return False
        # Ridimensiona se troppo grande
        if image.width > LARGHEZZA_MAX:
            ratio = LARGHEZZA_MAX / float(image.width)
            new_height = int((float(image.height) * float(ratio)))
            image = image.resize((LARGHEZZA_MAX, new_height), Image.Resampling.LANCZOS)
        # Salva WebP
        image.save(percorso_file, format="WEBP", quality=QUALITA_WEBP, optimize=True)
        return True
    except:
        return False

# --- MAIN LOOP ---
if not os.path.exists(MAIN_FOLDER):
    os.makedirs(MAIN_FOLDER)

try:
    print("Inizializzazione Browser...")
    driver = gs.Chrome()

    for nome_squadra, slug in TEAMS.items():
        print(f"\n--- ELABORAZIONE SQUADRA: {nome_squadra.upper()} ---")

        # Crea cartella specifica per la squadra
        cartella_squadra = os.path.join(MAIN_FOLDER, slug)
        if not os.path.exists(cartella_squadra):
            os.makedirs(cartella_squadra)

        url = f'https://www.legaseriea.it/it/team/{slug}/squadra'

        try:
            driver.get(url)
            time.sleep(2) # Attesa iniziale

            # Controllo se la pagina esiste (per squadre di B o URL errati)
            if "404" in driver.title or "Non Trovata" in driver.title:
                print(f"[!] Pagina non trovata per {nome_squadra} (forse in Serie B o URL diverso). Salto.")
                continue

            # Scrolling
            print(f"Scorrimento pagina {nome_squadra}...")
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            # Doppio scroll per sicurezza
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.5);")
            time.sleep(1)
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(3)

            # Estrazione
            tags_img = driver.find_elements(By.TAG_NAME, 'img')
            print(f"Analisi {len(tags_img)} elementi...")

            count = 0
            giocatori_fatti = set()
            headers = {'User-Agent': 'Mozilla/5.0'}

            for img in tags_img:
                try:
                    src = img.get_attribute('src')
                    if not src or 'placeholder' in src or '.svg' in src or 'base64' in src:
                        continue

                    # Logica rigorosa: deve essere dentro un link /player/
                    try:
                        parent = img.find_element(By.XPATH, "./ancestor::a")
                        href = parent.get_attribute('href')
                    except:
                        continue # Non è un link

                    if not href or "/player/" not in href:
                        continue

                    nome_player = pulisci_slug_giocatore(href)

                    if nome_player in giocatori_fatti:
                        continue

                    # Download
                    percorso = os.path.join(cartella_squadra, f"{nome_player}.webp")
                    r = requests.get(src, headers=headers, stream=True, timeout=5)

                    if r.status_code == 200:
                        if salva_se_valida(r.content, percorso):
                            print(f"  -> Scaricato: {nome_player}")
                            giocatori_fatti.add(nome_player)
                            count += 1
                except:
                    continue

            print(f"Completato {nome_squadra}: {count} immagini.")

        except Exception as e:
            print(f"Errore generico su {nome_squadra}: {e}")
            continue

    print(f"\n--- TUTTO FINITO! ---")

except Exception as e:
    print(f"Errore Critico Driver: {e}")
finally:
    if 'driver' in locals():
        driver.quit()


import shutil
from google.colab import files

print("Creazione archivio ZIP in corso (potrebbe richiedere qualche secondo)...")
shutil.make_archive('serie_a_full_dataset', 'zip', 'serie_a_full')
print("Download avviato.")
files.download('serie_a_full_dataset.zip')
