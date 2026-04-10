/**
 * replyFormatter.js
 * - Specific intents handled with clean replies
 * - FAISS context used only as last resort
 */

const CONTACT = `📞 +91 8197882511\n📞 +91 9731312275\n📩 enquiry@tirupatipackagetours.com`;

const packagesList = [
  "Tirupati 1 Day 1 Night Dharma Darshan Package",
  "Tirupati & Srikalahasti 2 Days 2 Nights Package",
];

function getBotReply(q) {
  // ── Contact ──
  if (q.includes("contact") || q.includes("call") || q.includes("number") || q.includes("phone") || q.includes("mobile") || q.includes("email") || q.includes("mail") || q.includes("whatsapp"))
    return `You can reach us at:\n${CONTACT}\n\nAvailable Packages:\n- ` + packagesList.join("\n- ");

  // ── Packages ──
  if (q.includes("package") || q.includes("packages"))
    return "Available Packages:\n- " + packagesList.join("\n- ") + `\n\nFor bookings: 📞 +91 8197882511`;

  // ── VIP ──
  if (q.includes("vip") || q.includes("indian") || q.includes("normal"))
    return "For Indians — VIP Darshan may be available 3 months prior. Not under tourist quota. Free Darshan is available.";

  // ── Price ──
  if (q.includes("price") || q.includes("cost") || q.includes("rate") || q.includes("how much") || q.includes("charges"))
    return "Package Pricing:\n• 1 Day Package → Starts from Rs.2300\n• 2 Day Package → Starts from Rs.2600";

  // ── Safety ──
  if (q.includes("lady") || q.includes("girls") || q.includes("women") || q.includes("female") || q.includes("safe") || q.includes("secure"))
    return "Yes, completely safe for single lady travellers. 🙏";

  // ── Cab ──
  if (q.includes("car") || q.includes("cab") || q.includes("taxi"))
    return "This is a bus package. We can arrange a cab on request.";

  // ── Best time to visit ──
  if ((q.includes("best time") || q.includes("good time") || q.includes("which month") || q.includes("when to visit") || q.includes("when should") || q.includes("ideal time") || q.includes("right time")))
    return "Best time to visit Tirupati:\n\n🌤️ September to February → Best time (pleasant weather)\n🔥 March to June → Very hot, not recommended\n🌧️ July to August → Moderate rain, less crowd\n\nFor bookings: 📞 +91 8197882511";

  // ── Darshan timing (specific) ──
  if (q.includes("darshan timing") || q.includes("darshan time") || q.includes("journey time") || q.includes("travel time") || q.includes("waiting time") || q.includes("how long darshan"))
    return "Darshan timings depend on TTD crowd conditions. Generally 1–5 hours.";

  // ── Darshan types ──
  if (q.includes("darshan type") || q.includes("types of darshan") || q.includes("sheeghra") || q.includes("sarva darshan"))
    return "Types of Darshan at Tirupati:\n\n• Sarva Darshan (Free) → Long wait\n• Sheeghra Darshan (Rs.300) → Faster entry\n• Divya Darshan → For footpath devotees\n• VIP Break Darshan → Special category\n\nBook via TTD portal: tirupatibalaji.ap.gov.in";

  // ── Festivals ──
  if (q.includes("festival") || q.includes("brahmotsavam") || q.includes("vaikunta") || q.includes("crowd"))
    return "Heavy crowd days at Tirupati:\n\n• Brahmotsavam (most crowded)\n• Vaikunta Ekadasi\n• Rathasapthami\n• New Year & major holidays\n\nPlan early during these days! 🙏";

  // ── Special seva ──
  if (q.includes("seva") || q.includes("suprabhatam") || q.includes("archana") || q.includes("kalyanotsavam"))
    return "Special Sevas at Tirupati:\n\n• Suprabhatam (early morning prayer)\n• Thomala Seva\n• Archana\n• Kalyanotsavam\n\n⚠️ Tickets must be booked in advance via TTD portal.";

  // ── Room ──
  if (q.includes("room") || q.includes("stay") || q.includes("accommodation") || q.includes("hotel"))
    return "Accommodation in 3-star deluxe rooms (subject to availability).";

  // ── Hot water ──
  if (q.includes("hot water") || q.includes("geyser"))
    return "Yes, 24/7 hot water available.";

  // ── Food ──
  if (q.includes("food") || q.includes("veg") || q.includes("breakfast") || q.includes("lunch"))
    return "Pure vegetarian South Indian food (1 breakfast + 1 lunch).";

  // ── Tirumala hill ──
  if (q.includes("uphill") || q.includes("tirumala room") || q.includes("hill"))
    return "Rooms not permitted at Tirumala as per TTD guidelines.";

  // ── Mundan ──
  if (q.includes("mundan") || q.includes("head shav") || q.includes("tonsure"))
    return "After Mundan, rooms at Tirumala not provided. Public restrooms available, guide will assist.";

  // ── Freshen up ──
  if (q.includes("freshen") || q.includes("single room"))
    return "Yes, a freshen-up room is provided before darshan (subject to availability).";

  // ── Senior ──
  if (q.includes("senior") || q.includes("old") || q.includes("citizen"))
    return "Senior citizen priority is not available under this package.";

  // ── Children ──
  if (q.includes("child") || q.includes("children") || q.includes("kids"))
    return "Children under 1 year → Free darshan.\nChildren under 5 years → Entry free.";

  // ── Special darshan ──
  if (q.includes("direct darshan") || q.includes("special darshan") || q.includes("direct pass"))
    return "Direct darshan passes only via official TTD portal.";

  // ── Bus type ──
  if (q.includes("seater") || q.includes("sleeper") || q.includes("bus type"))
    return "Yes, both seater and sleeper bus options available.";

  // ── Custom ──
  if (q.includes("custom"))
    return `Yes, we can customize your package.\n📞 +91 8197882511\n📩 enquiry@tirupatipackagetours.com`;

  // ── Srikalahasti ──
  if (q.includes("srikalahasti") || q.includes("rahu") || q.includes("ketu"))
    return "Srikalahasti Temple is included in Package 2 (2 Days 2 Nights).\nFamous for Rahu-Ketu Pooja. Located ~36 km from Tirupati. 🙏";

  // ── Cancel / refund ──
  if (q.includes("cancel") || q.includes("refund"))
    return `For cancellations, call us as early as possible:\n📞 +91 8197882511\n\nRefund policy depends on proximity to travel date.`;

  // ── Greet ──
  if (q.includes("hi") || q.includes("hello"))
    return `Hello! 😊 How can I help?`;

  if (q.includes("thank"))
    return `You're welcome! 😄`;

  return null; // fall through to FAISS
}

/**
 * Main reply function
 */
function formatReply(context, query) {
  const q = query.toLowerCase();

  // Try keyword replies first
  const originalReply = getBotReply(q);
  if (originalReply) return originalReply;

  // FAISS context — return null, let chatRoute use fallbackReply
  return null;
}

function fallbackReply() {
  return `I'm here to help with timings, packages or bookings.\n${CONTACT}`;
}

module.exports = { formatReply, fallbackReply, CONTACT };