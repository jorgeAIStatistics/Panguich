import type { Bilingual } from "@/lib/i18n";
import type { SourceId } from "./business";

/**
 * The Panguich menu as published by the restaurant on 2026-10-13.
 *
 * Rules this file follows:
 *  - Names and prices are copied from the restaurant's public pages, never invented.
 *  - When Toast and the website disagree on a price, the Toast price is shown (it is what a
 *    guest pays when ordering) and the other price is kept in `otherPriceCents`.
 *  - "restaurant" descriptions are the restaurant's own words (Spanish is our translation).
 *    "gloss" descriptions are a short general explanation of what the dish is, written for
 *    first-time guests. They make no ingredient, allergen, or portion promise and need owner review.
 *  - Availability says only what we saw: whether the item was listed for online ordering.
 *
 * This is editorial content. It is NOT the ordering system: availability, modifiers, taxes and
 * the final price are decided on Toast.
 */

export const MENU_CHECKED_ON = "2026-10-13";

export type MenuAvailability =
  /** Listed on the Toast online ordering page on the check date. */
  | "online"
  /** On the restaurant's website menu, but not listed for online ordering when checked. */
  | "in_store";

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  priceCents: number;
  priceSource: SourceId;
  /** A different price shown on the other source, if any. */
  otherPriceCents?: number;
  availability: MenuAvailability;
  description?: Bilingual;
  descriptionSource?: "restaurant" | "gloss";
  /** Shown under "Featured Items" on the restaurant's Toast page. Not a best-seller claim. */
  featuredOnToast?: boolean;
  note?: Bilingual;
};

export type MenuCategory = { id: string; name: Bilingual; blurb?: Bilingual };

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: "sanguches",
    name: { en: "Sánguches", es: "Sánguches" },
    blurb: { en: "Peruvian sandwiches, the heart of the menu.", es: "Los sánguches peruanos, el corazón de la carta." },
  },
  {
    id: "desayunos",
    name: { en: "Breakfasts", es: "Desayunos" },
    blurb: { en: "Breakfasts include coffee.", es: "Los desayunos incluyen café." },
  },
  { id: "platos", name: { en: "Plates & bowls", es: "Platos y bowls" } },
  { id: "pollo", name: { en: "Pollo a la brasa", es: "Pollo a la brasa" } },
  { id: "piqueos", name: { en: "Starters", es: "Piqueos" } },
  { id: "guarniciones", name: { en: "Sides", es: "Guarniciones" } },
  { id: "postres", name: { en: "Desserts", es: "Postres" } },
  { id: "jugos", name: { en: "Juices & shakes", es: "Jugos y batidos" } },
  { id: "cafe", name: { en: "Coffee & hot drinks", es: "Café y bebidas calientes" } },
  { id: "frias", name: { en: "Cold drinks & sodas", es: "Bebidas frías y gaseosas" } },
];

type Row = [
  id: string,
  name: string,
  price: number, // dollars as written on the source, converted to cents below
  availability: MenuAvailability,
  en?: string,
  es?: string,
  extra?: Partial<Pick<MenuItem, "otherPriceCents" | "descriptionSource" | "featuredOnToast" | "note">>,
];

const TWO_SIDES_EN = "Choose 2 sides: fries, maduros, fried yuca, white rice or salad.";
const TWO_SIDES_ES = "Elige 2 guarniciones: papas fritas, maduros, yuca frita, arroz blanco o ensalada.";

const ROWS: Record<string, Row[]> = {
  sanguches: [
    ["pan-con-chicharron", "Pan con Chicharrón", 13.99, "online", "Fried pork, sweet potatoes and criolla sauce.", "Chicharrón de cerdo, camote y salsa criolla.", { featuredOnToast: true }],
    ["sanguche-lomo-saltado", "Lomo Saltado", 13.99, "online", "Beef sautéed with onions and tomatoes.", "Lomo salteado con cebolla y tomate."],
    ["pan-con-pollo", "Pan con Pollo", 12.99, "online", "Chicken salad with lettuce and potato sticks.", "Ensalada de pollo con lechuga y papitas al hilo.", { featuredOnToast: true }],
    ["sanguche-pollo-a-la-brasa", "Pollo a la Brasa", 12.99, "online", "Peruvian rotisserie chicken with lettuce, tomato and ají pollero.", "Pollo a la brasa con lechuga, tomate y ají pollero."],
    ["butifarra", "Butifarra", 12.99, "online", "Peruvian-style cured ham with lettuce and criolla sauce.", "Jamón del país con lechuga y salsa criolla.", { featuredOnToast: true }],
    ["sanguche-asado", "Asado", 13.99, "online", "Peruvian classic slow-cooked eye round beef.", "Asado peruano clásico, cocido a fuego lento.", { otherPriceCents: 1299 }],
    ["pan-con-pavo", "Pan con Pavo", 13.99, "online", "Roasted turkey Peruvian style, lettuce, criolla sauce and signature mayostaza.", "Pavo horneado al estilo peruano, lechuga, salsa criolla y mayostaza de la casa.", { otherPriceCents: 1299 }],
    ["sanguche-huachana", "Huachana", 12.99, "online", "Classic soft Peruvian sausage scrambled with eggs.", "Salchicha huachana clásica revuelta con huevos."],
    ["pan-con-pejerrey", "Pan con Pejerrey", 13.99, "online", "Crispy fish, Peruvian mayo, lettuce and criolla sauce.", "Pejerrey crocante, mayonesa peruana, lechuga y salsa criolla."],
    ["pan-con-relleno", "Pan con Relleno", 13.99, "online", "Peruvian-style blood sausage with sweet potato.", "Relleno (morcilla peruana) con camote."],
    ["triple", "Triple", 13.99, "online", "Avocado, tomato, hard-boiled egg and mayonnaise on white bread.", "Palta, tomate, huevo duro y mayonesa en pan blanco."],
    ["triple-de-pollo", "Triple de Pollo", 15.99, "online", "Shredded chicken, avocado, tomato, mayonnaise and butter on white bread.", "Pollo deshilachado, palta, tomate, mayonesa y mantequilla en pan blanco."],
  ],
  desayunos: [
    ["desayuno-lurin", "Desayuno Lurín", 20.99, "in_store", "Fried pork, sweet potato and tamal, served with bread.", "Chicharrón, camote y tamal, servido con pan."],
    ["lomo-al-jugo", "Lomo al Jugo", 21.99, "in_store", "Beef sautéed with onions and tomatoes, served with bread.", "Lomo salteado con cebolla y tomate, servido con pan."],
    ["desayuno-huachano", "Huachano", 19.99, "in_store", "Peruvian sausage scrambled with eggs and tamale, served with bread.", "Salchicha huachana revuelta con huevos y tamal, servido con pan."],
    ["desayuno-americano", "Americano", 16.99, "in_store", "Scrambled or fried eggs, bacon, sausage and potato, served with toast.", "Huevos revueltos o fritos, tocino, salchicha y papa, servido con tostadas."],
    ["avocado-toast", "Avocado Toast", 14.99, "in_store", "Fresh smashed avocado, sourdough toast and fried egg.", "Palta fresca, pan de masa madre tostado y huevo frito."],
    ["desayuno-panguich", "Desayuno Panguich", 29.99, "in_store", "Crispy fried pork, huachana sausage, traditional Peruvian tamal and classic blood sausage. Served with two breads and two cups of coffee.", "Chicharrón crocante, salchicha huachana, tamal peruano tradicional y relleno clásico. Con dos panes y dos tazas de café."],
  ],
  platos: [
    ["lomo-saltado", "Lomo Saltado", 17.99, "online", "Stir-fry of beef, onions and tomatoes, served with white rice and fries.", "Salteado de lomo, cebolla y tomate, servido con arroz blanco y papas fritas."],
    ["arroz-chaufa-de-pollo", "Arroz Chaufa de Pollo", 16.99, "online", "Fried rice garnished with sweet and sour sauce, with chicken.", "Arroz chaufa con salsa agridulce, con pollo."],
    ["arroz-chaufa-de-cerdo", "Arroz Chaufa de Cerdo", 16.99, "online", "Fried rice garnished with sweet and sour sauce, with pork.", "Arroz chaufa con salsa agridulce, con cerdo."],
    ["pollo-saltado", "Pollo Saltado", 16.99, "online", "Chicken stir-fry in the style of lomo saltado.", "Salteado de pollo al estilo del lomo saltado.", { descriptionSource: "gloss" }],
    ["aji-de-gallina", "Ají de Gallina", 16.99, "online", "Shredded chicken in creamy Peruvian yellow pepper sauce.", "Pollo deshilachado en crema de ají amarillo."],
    ["tallarin-verde", "Tallarín Verde con Lomo Saltado", 17.99, "online", "Pasta in creamy Peruvian pesto-style sauce, served with lomo saltado.", "Tallarines en salsa verde cremosa al estilo peruano, con lomo saltado.", { note: { en: "The website menu also lists chicken milanese as an option.", es: "La carta del sitio web también indica milanesa de pollo como opción." } }],
    ["tallarin-huancaina", "Tallarín a la Huancaína con Lomo Saltado", 17.99, "online", "Pasta with huancaína sauce, served with lomo saltado.", "Tallarines con salsa huancaína, con lomo saltado.", { note: { en: "The website menu also lists chicken milanese as an option.", es: "La carta del sitio web también indica milanesa de pollo como opción." } }],
    ["tallarin-saltado", "Tallarín Saltado", 16.99, "online", "Beef and pasta sautéed with onions and tomatoes.", "Tallarines salteados con carne, cebolla y tomate."],
    ["asado-con-pure", "Asado con Puré", 17.99, "online", "Peruvian roast beef with mashed yellow Peruvian potatoes and rice.", "Asado peruano con puré de papa amarilla y arroz."],
    ["lomo-a-lo-pobre", "Lomo a lo Pobre", 20.99, "online"],
    ["arroz-tapado", "Arroz Tapado", 16.99, "online", "Pressed rice filled with Peruvian relleno and fried egg, served with plantain.", "Arroz moldeado con relleno peruano y huevo frito, servido con plátano."],
    ["tacu-tacu-lomo", "Tacu Tacu con Lomo", 17.99, "online", "Peruvian beans mixed with rice, served with our lomo saltado.", "Frejoles peruanos mezclados con arroz, servidos con nuestro lomo saltado."],
    ["arroz-con-pollo", "Arroz con Pollo", 19.99, "online"],
  ],
  pollo: [
    ["pollo-entero", "Pollo Entero", 27.99, "online", `Whole rotisserie chicken. ${TWO_SIDES_EN}`, `Pollo a la brasa entero. ${TWO_SIDES_ES}`],
    ["medio-pollo", "1/2 Pollo", 17.99, "online", `Half rotisserie chicken. ${TWO_SIDES_EN}`, `Medio pollo a la brasa. ${TWO_SIDES_ES}`],
    ["cuarto-de-pollo", "1/4 Pollo", 12.99, "online", `Quarter rotisserie chicken. ${TWO_SIDES_EN}`, `Cuarto de pollo a la brasa. ${TWO_SIDES_ES}`],
    ["mostro", "Mostro", 16.99, "online", "1/4 rotisserie chicken, chaufa rice and fries.", "1/4 de pollo a la brasa, arroz chaufa y papas fritas."],
  ],
  piqueos: [
    ["empanadas", "Empanadas", 4.99, "in_store", "Lomo saltado, pollo a la brasa or ají de gallina.", "De lomo saltado, pollo a la brasa o ají de gallina."],
    ["tamales", "Tamales", 7.99, "in_store", "Pork or chicken.", "De cerdo o de pollo."],
    ["tamal-verde", "Tamal Verde", 7.49, "in_store", "Peruvian cilantro green tamale.", "Tamalito verde peruano de culantro."],
    ["humita", "Humita", 7.49, "in_store", "Peruvian sweet tamale.", "Tamal dulce peruano."],
    ["papa-rellena", "Papa Rellena", 10.99, "in_store", "Fried potato purée filled with ground beef.", "Puré de papa frito, relleno de carne molida."],
    ["salchipapa", "Salchipapa", 10.99, "in_store", "French fries and hot dog.", "Papas fritas con hot dog."],
    ["tequenos", "Tequeños (4)", 10.99, "in_store", "Lomo saltado, pollo a la brasa, ají de gallina or cheese.", "De lomo saltado, pollo a la brasa, ají de gallina o queso."],
  ],
  guarniciones: [
    ["papas-fritas", "Papas Fritas", 4.0, "online", "French fries.", "Papas fritas.", { descriptionSource: "gloss" }],
    ["papas-fritas-familiares", "Papas Fritas Familiares", 7.0, "online", "Family-size fries.", "Papas fritas tamaño familiar.", { descriptionSource: "gloss" }],
    ["camote-frito", "Camote Frito", 5.0, "online", "Fried sweet potato.", "Camote frito.", { descriptionSource: "gloss" }],
    ["arroz-blanco", "Arroz Blanco", 5.0, "online", "White rice.", "Arroz blanco.", { descriptionSource: "gloss" }],
    ["frejoles", "Frejoles", 5.0, "online", "Beans.", "Frejoles.", { descriptionSource: "gloss" }],
    ["maduros", "Maduros", 5.0, "online", "Sweet plantains.", "Plátanos maduros.", { descriptionSource: "gloss" }],
    ["yuca-frita", "Yuca Frita", 5.0, "online", "Fried yuca.", "Yuca frita.", { descriptionSource: "gloss" }],
    ["ensalada-fresca", "Ensalada Fresca", 7.5, "online", "Fresh salad.", "Ensalada fresca.", { descriptionSource: "gloss" }],
    ["pan", "Pan", 1.7, "online", "Bread.", "Pan.", { descriptionSource: "gloss" }],
    ["rosquitas", "Rosquitas", 4.0, "online"],
  ],
  postres: [
    ["picarones", "Picarones", 10.0, "online", "Peruvian fried dough rings, a classic street dessert.", "Anillos de masa frita, un postre clásico de la calle peruana.", { descriptionSource: "gloss" }],
    ["arroz-con-leche", "Arroz con Leche", 8.0, "online", "Rice pudding.", "Arroz con leche.", { descriptionSource: "gloss" }],
    ["mazamorra-morada", "Mazamorra Morada", 8.0, "online", "Purple corn pudding.", "Mazamorra de maíz morado.", { descriptionSource: "gloss" }],
    ["combinado", "Combinado", 9.0, "online", "A “combinado” traditionally pairs arroz con leche and mazamorra morada.", "El “combinado” tradicionalmente junta arroz con leche y mazamorra morada.", { descriptionSource: "gloss" }],
    ["suspiro-limeno", "Suspiro Limeño", 8.0, "online", "A classic Lima dessert.", "Un postre clásico de Lima.", { descriptionSource: "gloss" }],
    ["torta-de-chocolate", "Torta de Chocolate", 8.0, "online", "Chocolate cake.", "Torta de chocolate.", { descriptionSource: "gloss" }],
    ["crocante-de-lucuma", "Crocante de Lúcuma", 8.0, "online", "Dessert made with lúcuma, a Peruvian fruit.", "Postre de lúcuma, fruta peruana.", { descriptionSource: "gloss" }],
    ["mousse-de-maracuya", "Mousse de Maracuyá", 8.0, "online", "Passion fruit mousse.", "Mousse de maracuyá.", { descriptionSource: "gloss" }],
    ["delicia-de-chirimoya", "Delicia de Chirimoya", 8.0, "online", "Dessert made with chirimoya (custard apple).", "Postre de chirimoya.", { descriptionSource: "gloss" }],
    ["turron-de-dona-pepa", "Turrón de Doña Pepa", 10.0, "online", "A traditional Peruvian layered sweet.", "Un dulce peruano tradicional en capas.", { descriptionSource: "gloss", note: { en: "Toast also lists a second Turrón de Doña Pepa at $17.00; the size is not stated.", es: "Toast también muestra otro Turrón de Doña Pepa a $17.00; no se indica el tamaño." } }],
    ["alfajor", "Alfajor", 4.5, "online", "Sandwich cookie.", "Alfajor.", { descriptionSource: "gloss" }],
    ["chocoteja", "Chocoteja", 3.75, "online", "A Peruvian chocolate confection.", "Un bombón peruano de chocolate.", { descriptionSource: "gloss" }],
    ["pecan-roll", "Pecan Roll", 6.0, "online"],
  ],
  jugos: [
    ["chicha-morada", "Chicha Morada", 6.75, "in_store", "Peruvian purple corn drink.", "Bebida peruana de maíz morado.", { descriptionSource: "gloss" }],
    ["jugo-naranja", "Jugo de Naranja", 7.25, "in_store", "Natural orange juice.", "Jugo natural de naranja."],
    ["jugo-papaya", "Jugo de Papaya", 7.25, "in_store", "Natural papaya juice.", "Jugo natural de papaya."],
    ["jugo-pina", "Jugo de Piña", 7.25, "in_store", "Natural pineapple juice.", "Jugo natural de piña."],
    ["jugo-maracuya", "Jugo de Maracuyá", 7.25, "in_store", "Natural passion fruit juice.", "Jugo natural de maracuyá."],
    ["jugo-mango", "Jugo de Mango", 7.25, "in_store", "Natural mango juice.", "Jugo natural de mango."],
    ["jugo-fresa", "Jugo de Fresa", 7.25, "in_store", "Natural strawberry juice.", "Jugo natural de fresa."],
    ["mixto-fresa-banana-papaya", "Fresa, Banana y Papaya", 8.75, "online", "Mixed juice: strawberry, banana, papaya.", "Jugo mixto: fresa, banana, papaya."],
    ["mixto-fresa-pina-papaya", "Fresa, Piña y Papaya", 8.75, "online", "Mixed juice: strawberry, pineapple, papaya.", "Jugo mixto: fresa, piña, papaya."],
    ["mixto-naranja-banana-papaya", "Naranja, Banana y Papaya", 8.75, "online", "Mixed juice: orange, banana, papaya.", "Jugo mixto: naranja, banana, papaya."],
    ["mixto-naranja-mango-pina", "Naranja, Mango y Piña", 8.75, "online", "Mixed juice: orange, mango, pineapple.", "Jugo mixto: naranja, mango, piña."],
    ["mixto-naranja-chirimoya", "Naranja y Chirimoya", 8.75, "online", "Mixed juice: orange, chirimoya.", "Jugo mixto: naranja, chirimoya."],
    ["mixto-mango-maracuya", "Mango y Maracuyá", 8.75, "online", "Mixed juice: mango, passion fruit.", "Jugo mixto: mango, maracuyá."],
    ["mixto-papaya-pina", "Papaya y Piña", 8.75, "online", "Mixed juice: papaya, pineapple.", "Jugo mixto: papaya, piña."],
    ["mixto-fresa-pina-papaya-banana", "Fresa, Piña, Papaya y Banana", 8.75, "online", "Mixed juice: strawberry, pineapple, papaya, banana.", "Jugo mixto: fresa, piña, papaya, banana."],
    ["surtido", "Surtido", 9.25, "online", "The house Peruvian mixed juice.", "El surtido peruano de la casa.", { descriptionSource: "gloss" }],
    ["batido-lucuma", "Batido de Lúcuma", 8.25, "online", "Shake with milk. Lúcuma is a Peruvian fruit.", "Batido con leche. La lúcuma es una fruta peruana."],
    ["batido-chirimoya", "Batido de Chirimoya", 8.25, "online", "Shake with milk.", "Batido con leche."],
    ["batido-mango", "Batido de Mango", 8.25, "online", "Shake with milk.", "Batido con leche."],
    ["batido-fresa", "Batido de Fresa", 8.25, "online", "Shake with milk.", "Batido con leche."],
    ["batido-banana", "Batido de Banana", 8.25, "online", "Shake with milk.", "Batido con leche."],
    ["batido-maracuya", "Batido de Maracuyá", 8.25, "online", "Shake with milk.", "Batido con leche."],
    ["batido-fresa-banana", "Batido de Fresa y Banana", 8.25, "online"],
    ["batido-papaya", "Batido de Papaya", 8.25, "online"],
    ["batido-pina", "Batido de Piña", 8.25, "online"],
  ],
  cafe: [
    ["espresso", "Espresso", 3.0, "online", undefined, undefined, { otherPriceCents: 325 }],
    ["colada", "Colada", 2.75, "online"],
    ["cortadito", "Cortadito", 3.2, "online", undefined, undefined, { otherPriceCents: 350 }],
    ["cafe-americano", "Café Americano", 4.25, "online"],
    ["cafe-con-leche", "Café con Leche", 4.75, "online"],
    ["chocolate-caliente", "Chocolate Caliente", 4.75, "online", "Hot chocolate.", "Chocolate caliente.", { descriptionSource: "gloss" }],
    ["te", "Té", 4.25, "online", "Tea.", "Té.", { descriptionSource: "gloss" }],
    ["emoliente", "Emoliente", 5.75, "online", "A traditional Peruvian herbal drink, served warm.", "Bebida peruana tradicional de hierbas, servida caliente.", { descriptionSource: "gloss" }],
  ],
  frias: [
    ["americano-helado", "Café Americano Helado", 5.5, "online", "Iced americano.", "Americano helado.", { otherPriceCents: 575, descriptionSource: "gloss" }],
    ["cafe-con-leche-helado", "Café con Leche Helado", 6.0, "online", "Iced latte.", "Café con leche helado.", { descriptionSource: "gloss" }],
    ["te-frio", "Té Frío", 5.5, "online", "Iced tea.", "Té frío.", { descriptionSource: "gloss" }],
    ["emoliente-frio", "Emoliente Frío", 6.25, "online", "The traditional Peruvian herbal drink, served cold.", "La bebida peruana tradicional de hierbas, servida fría.", { descriptionSource: "gloss" }],
    ["inca-kola", "Inca Kola", 3.5, "online", "Peruvian soda.", "Gaseosa peruana.", { descriptionSource: "gloss" }],
    ["inca-kola-diet", "Inca Kola Diet", 3.5, "online"],
    ["kola-inglesa", "Kola Inglesa", 3.75, "online", "Peruvian soda.", "Gaseosa peruana.", { descriptionSource: "gloss" }],
    ["socosani", "Socosani", 3.25, "online", "Sparkling water.", "Agua con gas."],
    ["coca-cola", "Coca-Cola", 3.5, "online"],
    ["diet-coke", "Diet Coke", 3.0, "online"],
    ["coke-zero", "Coke Zero", 3.5, "online"],
    ["sprite", "Sprite", 3.5, "online"],
    ["agua", "Agua", 2.5, "online", "Water.", "Agua.", { descriptionSource: "gloss" }],
    ["inca-kola-2l", "Inca Kola 2 L", 7.5, "online"],
    ["kola-inglesa-2l", "Kola Inglesa 2 L", 6.75, "online"],
  ],
};

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export const MENU_ITEMS: MenuItem[] = Object.entries(ROWS).flatMap(([categoryId, rows]) =>
  rows.map(([id, name, price, availability, en, es, extra]): MenuItem => {
    const hasDescription = Boolean(en && es);
    return {
      id,
      categoryId,
      name,
      priceCents: toCents(price),
      // Items listed for online ordering take the Toast price; the rest come from the website menu.
      priceSource: availability === "online" ? "toast" : "panguich_us",
      availability,
      ...(hasDescription ? { description: { en: en!, es: es! } } : {}),
      ...(hasDescription ? { descriptionSource: extra?.descriptionSource ?? "restaurant" } : {}),
      ...(extra?.otherPriceCents ? { otherPriceCents: extra.otherPriceCents } : {}),
      ...(extra?.featuredOnToast ? { featuredOnToast: true } : {}),
      ...(extra?.note ? { note: extra.note } : {}),
    };
  }),
);

const BY_ID = new Map(MENU_ITEMS.map((item) => [item.id, item]));

export function getMenuItem(id: string): MenuItem | undefined {
  return BY_ID.get(id);
}

export function itemsInCategory(categoryId: string): MenuItem[] {
  return MENU_ITEMS.filter((item) => item.categoryId === categoryId);
}

/** The three items the restaurant itself features on its Toast page. */
export function featuredItems(): MenuItem[] {
  return MENU_ITEMS.filter((item) => item.featuredOnToast);
}

/** Lower-cases and strips accents so "chicharron" finds "Chicharrón". */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word typed must appear in the item's name, description (either language) or category. */
export function searchMenu(query: string, items: MenuItem[] = MENU_ITEMS): MenuItem[] {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return items;
  const categoryNames = new Map(MENU_CATEGORIES.map((c) => [c.id, `${c.name.en} ${c.name.es}`]));
  return items.filter((item) => {
    const haystack = normalizeForSearch(
      [item.name, item.description?.en, item.description?.es, categoryNames.get(item.categoryId)].filter(Boolean).join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}
