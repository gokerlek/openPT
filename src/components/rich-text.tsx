/**
 * `**kalın**` işaretli sözlük metni (`install` sözlüğünün sihirbaz adımları gibi): işaretli parçalar `<strong>` olur,
 * gerisi düz metin. Sözlüklerde başka biçim işareti yok; metnin kendisi her dilde cümle olarak kalır.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))}
    </>
  );
}
