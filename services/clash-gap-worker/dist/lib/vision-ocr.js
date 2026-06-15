import { ImageAnnotatorClient } from '@google-cloud/vision';
let client = null;
function getClient() {
    if (!client)
        client = new ImageAnnotatorClient();
    return client;
}
function textFromFullAnnotation(fullText) {
    return (fullText ?? '').trim();
}
export async function ocrImageWithVision(imageBuffer) {
    const [result] = await getClient().documentTextDetection({
        image: { content: imageBuffer },
    });
    const docText = textFromFullAnnotation(result.fullTextAnnotation?.text);
    if (docText)
        return docText;
    const annotations = result.textAnnotations;
    if (annotations?.length) {
        return textFromFullAnnotation(annotations[0]?.description);
    }
    return '';
}
export function visionOcrStatus() {
    return {
        configured: true,
        engine: 'google-cloud-vision-document-text',
    };
}
