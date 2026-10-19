# Debye Lab

En lokal webbapp som kombinerar TiN-simuleringens textur/spänning med experimentell ringgeometri och CIF-import. Originalet finns kvar oförändrat i `TiN_live.html`. Den nya appen startar från **`index.html`** eller **`Debye_lab.html`**. Båda är kompletta HTML-filer med CSS, JavaScript och WC-exempelbild inbyggda. Ingen serverbackend, inga nycklar och inga externa skript krävs.

## Användning

Gränssnittet är mörkt och anpassat för ett webbläsarfönster. Endast en diffraktionsbild visas åt gången: välj **Experiment**, **Beräknat** eller **Differens** ovanför bilden. Experiment och modell använder samma termiska färgskala (mörkt → lila → orange → ljusgult). Differensen behåller blått–vitt–rött, med vitt vid noll. Färgskalan ändrar inte intensitetsdata eller anpassningen.

Vänsterpanelen har flikarna **Data**, **Geometri**, **Textur** och **Anpassa**. Utförliga resultat och radialprofiler öppnas med **Resultat & profiler**, och modellbeskrivning/dataformat med **Hjälp**. Huvudvyn och samtliga inställningsflikar ryms utan skrollning vid testade skrivbordsstorlekar 1366 × 768, 1280 × 720 och 1024 × 768. På mindre skärmar kan inställningspanelen skrollas separat; själva bildfönstret ligger kvar inom vyn.

Ladda ned **`Debye_lab.html`** och öppna den i en vanlig webbläsare. Filen fungerar även utan internet och behöver inga andra filer. En GitHub-kodvy eller en förhandsvisning som blockerar JavaScript kör inte appen. Alternativt: publicera repositoryts `main` och rotkatalog med GitHub Pages; `index.html` blir startsidan. `npm start` startar en lokal statisk utvecklingsserver (Python 3 krävs).

Appen startar med **syntetiska TiN-data med känt facit**, inte med experimentdata. Knappen **Öppna din WC-bild** läser JPEG-bilden som extraherats oförändrad ur den uppladdade `WC_interaktiv_radial_ickelinjaritet.html`. WC-exemplets pixelstorlek 0,1 mm är ett antagande. Ändra den till detektorns verkliga värde innan avståndet i mm tolkas. För WC används användarens värden **E = 450 000 MPa, ν = 0,25** och våglängdsintervall **0,17–0,20 Å**. Startvåglängden är 0,20 Å; kalibreringen håller sig inom intervallet.

1. Läs in en experimentbild eller en intensitetsmatris. Ange verklig pixelstorlek i mm/originalpixel. Byt CIF till provets struktur.
Dragreglage finns för våglängd, detektoravstånd, β och centrum x/y; sifferfälten följer reglagen och kan användas för finjustering. Centrumreglagen flyttar modellen och ringöverlagringen över den fasta experimentbilden. WC:s våglängdsreglage använder intervallet 0,17–0,20 Å.

2. Klicka **Hitta centrum automatiskt**. Kontrollera krysset, ändra koordinaterna manuellt eller klicka i experimentbilden. Koordinaterna är alltid originalbildens pixlar; (0,0) är översta vänstra pixelns centrum.
3. Ange känd våglängd eller känt prov–detektoravstånd. Välj vilken av de andra parametrarna som ska kalibreras. Anpassa geometrin mot **en ospänd referens med kända gitterparametrar**. Geometrikalibreringen sätter spänningen till noll. Välj ett rimligt startvärde så att rätt ringfamiljer överlappar; sökningen är lokal.
4. Ange texturaxel [u v w], provets E i MPa och ν. Välj textur/spänningsparametrar och eventuellt finjustering av centrum/toppbredd, klicka **Anpassa textur & spänning**. Geometrin hålls fast i detta steg.
5. Granska experiment, beräkning, den signerade differensen och radialprofilerna. Exportera resultat med parametrar, CIF-text och felmått till JSON, radialprofiler till CSV, eller själva differensen som numerisk CSV/PNG.

Positiv spänning betyder drag. I prov-/detektorplanet är 0° åt höger och 90° uppåt; riktningarna anges modulo 180°. Riktningen saknar bestämning vid σ = 0 respektive r = 1. [u v w] är en **direkt kristallriktning**, inte en normal till ett godtyckligt (hkl)-plan i en icke-kubisk kristall.

## Dataformat

- **CSV/TXT:** rektangulär 2D-matris, en bildrad per textrad, punkt som decimaltecken, komma/semikolon/mellanslag mellan kolumner. `NaN` eller `?` maskerar en pixel; rader som börjar med `#` är kommentarer. Inga axelkolumner eller kolumnrubriker. Negativa bakgrundskorrigerade intensiteter bevaras.
- **JSON:** `[[1,2],[3,4]]` eller `{"width":2,"height":2,"data":[1,2,3,4]}`. `null` maskerar en pixel. Intensiteterna är numeriska och linjära.
- **TIFF:** klassisk, okomprimerad, en gråskalekanal, strips, svart=0, normal orientering. 8/16/32-bit heltal (signerade eller osignerade) och 32-bit float, little/big endian. BigTIFF, LZW/Deflate, tiles, RGB och andra orienteringar stöds inte; exportera dessa som okomprimerad TIFF eller CSV. Värdena läses numeriskt utan 8-bitars konvertering.
- **PNG/JPEG/WebP:** webbläsarens pixelvärden omvandlas till luminans; alternativet inverterad skala finns för mörka ringar. Ingen invertering av färgkarta, gamma eller logaritmisk intensitet görs. Transparenta pixlar maskeras.
- Bilder ska vara minst 8 × 8 och högst 17 miljoner pixlar. För beräkning används blockmedelvärden till högst cirka 640 pixlar per sida. Originalkoordinater och effektiv pixelstorlek hålls ihop. Ofullständiga kantblock beskärs, och ett block med maskerade pixlar maskeras helt. Den numeriska differensexporten gäller den reducerade analysbilden.

**Din WC-bild är färglagd JPEG.** Den är användbar för centrum och ringpositioner, men ursprungliga linjära intensiteter går inte att återfå från den här filen. Textur- och spänningsanpassningen av denna bild är illustrativ. För kvantitativ analys behövs ursprungliga intensiteter, känd geometri och material-/instrumentmodell.

## CIF och fysikmodell

- Ett CIF `data_`-block med cellparametrar, fraktionella atompositioner och explicita symmetrioperationer (`_space_group_symop_operation_xyz` eller `_symmetry_equiv_pos_as_xyz`). P1 tillåts utan operationslista. Övriga grupper utan operationslista avvisas för att undvika felaktig cell och intensitet. Symmetriuttryck tolkas som begränsade affina uttryck, aldrig genom `eval`.
- Fullcellsexempel för TiN och WC finns i `examples/*.cif`. De är deklarerade som P1 med samtliga atomer för beräkningens skull: det betyder **inte** att materialen fysiskt bytt rymdgrupp. TiN använder a = 4,4 Å från den första HTML-filen; WC använder a = 2,9054 Å och c = 2,84015 Å från den andra. Använd uppmätta/kända ospända gitterparametrar för verklig analys.
- Cromer–Mann-formfaktorer för neutrala **C, N, O, Ti och W**, beläggning och isotropa B/U. Andra element avvisas uttryckligen. Alla heltalsreflexer inom q-max genereras i reciprokmetrik; strukturamplituden ger utsläckningar och multipliciteter. Sammanfallande d-avstånd grupperas med viktad texturintegration.
- Braggs lag, plan detektor vinkelrät mot strålen, pulver-Lorentzfaktor, linjär horisontell eller opolariserad stråle och plan-detektor-area ingår. Gaussprofiler med konstant FWHM i 2θ. Pixelintegrationen approximeras med signalen vid pixelcentrum; otillräckligt upplösta toppar och reducering kan påverka anpassningen.
- March–Dollase integreras över rotationer runt spridningsvektorn och reflektionsriktningarna. Texturaxeln antas ligga i detektorplanet. Integrationen är numerisk (64 rotationspunkter, 180 azimutpunkter med interpolation).
- Enaxlig isotrop elasticitet: `ε = (σ/E)[(1+ν)n⊗n − νI]`, `d′ = d(1 + q̂·ε·q̂)` och itererad Braggvinkel. E och ν är användarens indata; WC använder användarens angivna 450 000 MPa och 0,25, och TiN-exemplets värden är illustrationer. Materialanisotropi/diffraktionselastiska konstanter behandlas inte.
- **Radiell β-korrektion från WC-filen finns som dragreglage (−0,04 till +0,04):** `R = L tan(2θ) [1 + β((q/q001)² − 1)]`, där q001 beräknas från CIF-cellens reciproka (001)-vektor. (001) hålls fast, β = 0 återger den plana geometrin. Korrektionen flyttar modellens och överlagringens ringpositioner; den är empirisk, korrigerar inte detektorns intensitetsrespons och kan förväxlas med geometri/spänning. β hålls fast under automatisk anpassning och sparas i resultatexporten. Radialprofiler visar nominell 2θ från pixelstorlek/avstånd även när β ≠ 0. Värden som ger icke-positiva ringradier avvisas. Detektorlutning, absorption, anomal spridning, flera faser, varierande bakgrund, kornfläckar och anisotropa temperaturfaktorer modelleras inte.

### Differens och anpassning

Modellens positiva skalfaktor och valfria konstanta bakgrund löses analytiskt i linjära dataenheter. Experiment och modell visas med **samma** intensitetsskala. Differensen är alltid `Iexperiment − Iberäknat`, inte skillnaden mellan två separat normaliserade bilder. Vitt betyder noll, rött positivt och blått negativt; maskerade pixlar är grå. Ändring av visningsskala påverkar inte optimering eller numerisk differens.

`RMSE = sqrt(mean(residual²))`. `R = sqrt(sum(residual²)/sum(Iexperiment²))` är ett **oviktat** relativt fel, inte en statistiskt viktad Rietveld-faktor eller en skattad osäkerhet. Positiv skala och bakgrund uppskattas på ett deterministiskt stickprov; felmåtten ovanför bilderna beräknas på hela analysbilden.

Centrum uppskattas från gradienternas skärning och förfinas med 180° bildsymmetri. Lokal parameteranpassning använder koordinatsökning med flera starter för riktning/textur/spänning och ett fast stickprov av omaskerade pixlar (cirka 10 000) per körning. Radialmaskens urval hålls fast under optimeringen; bildresultatet maskeras om med slutcentrum. Starta nära rätt geometri och prova alternativa startvärden. Flerparametrar, detektorfel och fel fas kan ge lokala minima. λ och avstånd anpassas inte samtidigt på grund av stark korrelation.

**Detta är en fungerande prototyp för modelljämförelse, inte validerad metrologi.** En nästan vit differensbild bevisar inte att materialparametrarna är unika eller korrekta. Vid verklig spänningsbestämning behövs instrumentkalibrering, relevanta elastiska konstanter och en osäkerhetsanalys.

## Utveckling och verifiering

Ingen installation behövs för appen. Källfilerna är `page.template.html`, `style.css`, `debye-core.js` och `app.js`. Efter ändringar körs `npm run build` för att uppdatera båda självständiga HTML-filerna. Bygget bäddar även in WC-bilden och ger filerna en synlig versionskod. Node 20+ behövs för bygget och testerna:

```sh
npm test
```

För webbläsartester (Playwright är endast ett utvecklingsberoende):

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:browser
```

Finns Chromium redan på `/usr/bin/chromium` används den; `CHROMIUM_PATH` kan ange en annan installation. Testet startar och stänger sin egen lokala HTTP-server. Webbläsare behöver inte installeras för att använda webbappen.

Numeriska tester täcker oberoende hexagonal d(hkl), FCC-utsläckningar/multipliciteter, CIF-symmetri och avvisning av osäkra/otillräckliga uttryck, March–Dollase, elastisk Braggrelation, gemensam skalning och nära noll-residual, maskning, centrum, återfunna kända anpassningsparametrar och geometri, matrisimport samt 16/32-bitars TIFF i båda byteordningarna. Webbläsartestet kör det synliga arbetsflödet, resultatexport, WC-import/centrum, numerisk import, felhantering, avbrytning och mobil layout.
