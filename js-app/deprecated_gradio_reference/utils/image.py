import base64
from io import BytesIO
from PIL import Image
import logging

class Img:
    @staticmethod
    def preprocess(img):
        try:
            w, h = img.size
            mpixel = 1_000_000
            ratio = w / h
            new_h = int((mpixel / ratio) ** 0.5)
            new_w = int(new_h * ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS) if w * h != mpixel else img
            buf = BytesIO()
            img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode('utf-8')
        except Exception as e:
            logging.error(f"Image error: {str(e)}")
            raise ValueError("Image processing failed.")
