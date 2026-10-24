# BeatWave Music

Discord.js ve Lavalink v4 tabanlı bir Discord müzik botu MVP'si.

## Özellikler

- Slash komutları: `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/volume`
- Sunucu başına bağımsız müzik kuyruğu
- Lavalink bağlantısı ve otomatik sonraki parçaya geçiş
- YouTube arama ve bağlantıları için Lavalink YouTube Source eklentisi
- Ses komutlarında botun bulunduğu ses kanalını doğrulama
- Docker ile Lavalink çalıştırma ve GitHub Actions ile JavaScript sözdizimi kontrolü

> **Durum:** Bu proje henüz gerçek bir Discord sunucusunda uçtan uca doğrulanmış değildir. CI kontrollerinin geçmesi, Discord bağlantısını veya müzik kaynağını tek başına kanıtlamaz.

## Gereksinimler

- Node.js 20 veya üzeri ve npm
- Docker Desktop (Lavalink için)
- Discord Developer Portal'da oluşturulmuş bir bot uygulaması

## Debian 12 VDS'ye tek script ile kurulum

Temiz bir Debian 12 sunucuda root olarak aşağıdaki komutlar Docker, Lavalink, bot ve web panelini kurar. Script token, panel parolası ve isteğe bağlı Spotify bilgilerini GitHub'a yazmadan kurulum sırasında sorar:

```bash
curl -fsSL https://raw.githubusercontent.com/KeuqS/discord-music-bot/main/install.sh -o install.sh
bash install.sh
```

Kurulum tamamlandığında panel `http://SUNUCU_IP:3000` adresinde olur. Ticari kullanım öncesinde paneli alan adı ve HTTPS arkasına almak gerekir.

## 1. Discord botunu oluştur

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bir uygulama oluştur.
2. **Bot** sekmesinden botu oluştur ve token'ını al. Token'ı kimseyle paylaşma ve GitHub'a yükleme.
3. **OAuth2 → URL Generator** bölümünde `bot` ve `applications.commands` kapsamlarını seç.
4. Bot izinlerinde en azından `View Channels`, `Connect`, `Speak`, `Send Messages` ve `Use Application Commands` izinlerini seç; oluşturulan URL ile botu test sunucuna ekle.
5. Uygulamanın **Application ID** değerini kopyala.

Bot için privileged intent açılması gerekmez; uygulama sunucu ve ses durumu intent'lerini kullanır.

## 2. Ortam değişkenlerini hazırla

Depoyu bilgisayarına indir veya klonla, ardından proje klasöründe:

```bash
cp .env.example .env
```

Windows PowerShell kullanıyorsan:

```powershell
Copy-Item .env.example .env
```

`.env` dosyasına şu değerleri gir:

- `DISCORD_TOKEN`: Discord bot token'ı
- `CLIENT_ID`: Discord uygulamasının Application ID değeri
- `GUILD_ID`: Komutları hızlıca test etmek istediğin sunucunun ID'si (isteğe bağlı; boş bırakılırsa komutlar global kaydedilir)
- `LAVALINK_PASSWORD`: Kendine ait, uzun ve rastgele bir parola

Aynı `LAVALINK_PASSWORD` değeri Docker Compose tarafından Lavalink'e aktarılır. Örnek parolayı kullanma. Örneğin parola üretmek için:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Çıktıyı `.env` içindeki `LAVALINK_PASSWORD` alanına kopyala. Gerçek `.env` dosyanı veya bot token'ını GitHub'a gönderme.

## 3. Bağımlılıkları kur

```bash
npm install
npm run check
```

## 4. Lavalink'i başlat

Docker Desktop'ın açık olduğundan emin ol. Proje kök dizininde:

```bash
docker compose up -d
docker compose logs -f lavalink
```

Lavalink portu yalnızca yerel bilgisayara (`127.0.0.1:2333`) bağlanır; internetten doğrudan erişime açılmaz. Botu aynı bilgisayarda çalıştırıyorsan varsayılan `LAVALINK_HOST=localhost` ayarı uygundur.

Lavalink loglarında başlangıç hatası görürsen botu başlatmadan önce parola ve yapılandırmayı kontrol et. Kapatmak için `docker compose down` kullanabilirsin.

## 5. Slash komutlarını kaydet

`.env` dosyası hazırken:

```bash
npm run deploy
```

Test sunucusu için `GUILD_ID` girmen komutların daha hızlı görünmesini sağlar. Boş bırakırsan global komutlar kaydedilir ve görünmeleri daha uzun sürebilir.

## 6. Botu çalıştır

```bash
npm start
```

Terminalde botun giriş yaptığını ve Lavalink node bağlantısını kontrol et. Terminali kapatırsan bot durur.

## 7. Test sırası

Botu önce boş veya özel bir test sunucusunda dene:

1. Botu ses kanalına katılabilir ve konuşabilir izinlerle ekle.
2. Kendin bir ses kanalına katıl.
3. `/play query: lo-fi` ile SoundCloud araması dene.
4. `/queue`, `/pause`, `/resume`, `/volume percent: 50`, `/skip` ve `/stop` komutlarını sırayla test et.
5. Botun olmadığı başka bir ses kanalından kontrol komutları kullanmayı dene; bot bu komutları reddetmelidir.
6. Lavalink'i kapatıp bağlantı hatalarını gözlemle; sonra yeniden başlat.

## Müzik kaynakları

Dahil edilen Lavalink yapılandırmasında SoundCloud ve YouTube araması etkindir. YouTube için Lavalink'in güncel `youtube-source` eklentisi kullanılır; YouTube tarafındaki geçici kısıtlamalar veya bot doğrulaması nedeniyle her bağlantının her zaman çalışacağı garanti edilemez. Spotify veya Apple Music gibi servislerden içerik çekildiğini varsayma.

## Sorun giderme

- **Komutlar görünmüyor:** `npm run deploy` çalıştırıldığını, `CLIENT_ID` ve varsa `GUILD_ID` değerlerini kontrol et.
- **Bot giriş yapmıyor:** Token'ın doğru ve yenilenmemiş olduğunu kontrol et.
- **Lavalink bağlanmıyor:** Docker'ın çalıştığını, `docker compose logs -f lavalink` çıktısını ve iki taraftaki `LAVALINK_PASSWORD` değerinin aynı olduğunu kontrol et.
- **Arama sonuçsuz:** SoundCloud kaynağının ve arama platformunun etkin olduğunu doğrula; Lavalink loglarına bak.
- **Bot sesi duymuyor:** Botun `Connect` ve `Speak` izinlerini, kanal erişimini ve Lavalink bağlantısını kontrol et.

## Güvenlik notları

- `.env` ve Discord token'ını asla commit etme.
- Lavalink portunu internete açma; uzaktaki bir sunucuda çalıştırırsan bot ile Lavalink'i özel bir ağda tut.
- Token sızarsa Discord Developer Portal'dan yenile.
