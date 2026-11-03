# Origins · 1330

Siyah–altın tema. Alternatif Orta Çağ / erken gemi çağı masa RPG sitesi (1330 Avrupa).

## Kurulum
Klasörü bir web sunucusunda veya yerel olarak açın (`index.html`).  
Chrome / Edge önerilir (PeerJS odaları, localStorage).

## Sekmeler
1. **DM** — şifreli kanal, NPC / düşman kütüphanesi, kampanya defteri  
2. **Evren** — lore, lakap renkleri  
3. **Hikâye** — anlatı  
4. **Karakter** — karakter + yoldaş formu, özel lakap yazılabilir  
5. **Masa** — VTT: grid, token, fog, duvar, kapı, zar, inisiyatif, canlı oda  
6. **Harita** — 1330 Avrupa haritası + çizim katmanı  

## DM şifresi
`1`

Masa panelindeki DM kilidi ve DM sayfası aynı şifreyi kullanır.

## Sesler (isteğe bağlı)
`assets/sounds/` içine koyun:
- `hit.mp3` — vuruş  
- `crit.mp3` — kritik  
- `miss.mp3` — ıska  
- `heal.mp3` — şifa  
- `dice.mp3` — zar  
- `downed.mp3` — yere düşüş  
- `critmiss.mp3` — kritik ıska  

Yoksa sentez ses kullanılır; Masada da yüklenebilir.

## Not
Veriler tarayıcı `localStorage` içinde tutulur. Yedek için Masada **Dışa aktar (JSON)** kullanın.


Ambiyans sentez: Liman, Savaş, Fısıltı, **Yağmur** (mp3 opsiyonel).

## Sayfalar
- `index.html` — ana giriş
- `dm.html` — DM kanalı (NPC / dost / nötr / düşman), şifre: `1`
- `oyun.html` — masa (VTT)
- `karakter.html` — karakter oluşturma
