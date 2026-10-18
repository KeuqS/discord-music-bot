# Discord Music Bot

Discord.js ve Lavalink v4 tabanlı, Beatra benzeri bir müzik botu MVP'si.

## Özellikler

- Slash komutları: `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/volume`
- Sunucu başına bağımsız müzik kuyruğu
- Lavalink node bağlantısı ve otomatik sonraki parçaya geçiş
- Arama ve desteklenen kaynak URL'leri için tek `/play` akışı
- Docker ile yerel Lavalink geliştirme ortamı

## Kurulum

1. Discord Developer Portal'dan bir bot oluştur ve token ile application ID'yi al.
2. `.env.example` dosyasını `.env` olarak kopyala ve değerleri doldur.
3. Bağımlılıkları kur:

   ```bash
   npm install
   ```

4. Lavalink'i çalıştır. Örnek yapılandırma için `docker-compose.yml` ve `lavalink/application.yml` dosyalarına bak.
5. Slash komutlarını kaydet:

   ```bash
   npm run deploy
   ```

6. Botu başlat:

   ```bash
   npm start
   ```

Varsayılan arama kaynağı `scsearch` (SoundCloud) olarak ayarlanmıştır. YouTube veya başka sağlayıcılar için Lavalink'e ilgili, kullanım koşullarına uygun source/plugin ekleyip `LAVALINK_SEARCH_PLATFORM` değerini değiştir.

## Discord izinleri

Botun en azından `View Channel`, `Connect`, `Speak`, `Send Messages` ve `Use Application Commands` izinlerine ihtiyacı vardır.

## Kaynak ve telif notu

Lavalink source/plugin seçimini kullandığın platformların kullanım koşullarına ve gerekli lisanslara göre yapılandır. Spotify veya Apple Music gibi servislerin içeriklerini izinsiz yeniden yayınlama; bu MVP bağlantıları ve metadata eşleştirmesini platform kurallarına uygun şekilde genişletmek için tasarlanmıştır.

## Sonraki adımlar

- Redis tabanlı kalıcı kuyruklar
- Discord OAuth2 web paneli
- Playlist ve favoriler
- Lyrics sağlayıcısı
- Çoklu Lavalink node ve yük dengeleme
- Premium plan ve sunucu ayarları
