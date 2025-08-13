import requests
import logging
import base64
import json
from io import BytesIO
from PIL import Image

class API:
    def __init__(self, key=None, url=None, model=None, token_limit=2048, temp=0.7, top_p=0.9):
        self.key = key
        self.url = url
        self.model = model
        self.token_limit = token_limit
        self.temp = temp
        self.top_p = top_p

    def req(self, prompt, img_data=None):
        """Send a request to the API, with optional image data."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.key}"
        }
        content = [{"type": "text", "text": prompt}]
        if img_data:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{img_data}", "detail": "high"}
            })
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": self.token_limit,
            "temperature": self.temp,
            "top_p": self.top_p
        }
        try:
            response = requests.post(self.url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
        except requests.RequestException as e:
            logging.error(f"API error: {str(e)}")
            return f"Error: {str(e)}"

    def ollama_analyze_image(self, image):
        """Analyze an image using Ollama's model, handling a Gradio Image object."""
        generate_url = f"{self.url}/api/generate"

        # Convert the Gradio Image object to Base64
        buffered = BytesIO()
        image.save(buffered, format="PNG")  # Ensure PNG format; change to "JPEG" if needed
        base64_image = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        vision_payload = {
            "model": self.model,
            "prompt": "Analyze the image, focusing on specific objects, body types, colors, textures, gender expressions...",
            "images": [base64_image],
            "stream": True
        }
        
        try:
            response = requests.post(generate_url, headers={"Content-Type": "application/json"}, json=vision_payload, stream=True)
            analysis_result = ""
            
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            json_line = json.loads(line)
                            analysis_result += json_line.get("response", "")
                        except json.JSONDecodeError:
                            return "Error: Malformed JSON from server."
                return analysis_result
            else:
                return f"Error: Server returned {response.status_code}. Response: {response.text}"
        except requests.RequestException as e:
            logging.error(f"Ollama API error: {str(e)}")
            return f"Error: {str(e)}"

    def ollama_generate_completion(self, prompt):
        """Generate text completion using Ollama's prompt model."""
        generate_url = f"{self.url}/api/generate"
        text_payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True
        }
        
        try:
            response = requests.post(generate_url, headers={"Content-Type": "application/json"}, json=text_payload, stream=True)
            completion_result = ""
            
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            json_line = json.loads(line)
                            completion_result += json_line.get("response", "")
                        except json.JSONDecodeError:
                            return "Error: Malformed JSON from server."
                return completion_result
            else:
                return f"Error: Server returned {response.status_code}. Response: {response.text}"
        except requests.RequestException as e:
            logging.error(f"Ollama API error: {str(e)}")
            return f"Error: {str(e)}"

    def pull_model(self, model_name):
        """Pull model if not already available for Ollama."""
        pull_url = f"{self.url}/api/pull"
        pull_payload = {"name": model_name}
        
        try:
            response = requests.post(pull_url, headers={"Content-Type": "application/json"}, data=json.dumps(pull_payload), stream=True)
            pull_status = ""
            
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            json_line = json.loads(line)
                            pull_status += json_line.get("status", "") + "\n"
                        except json.JSONDecodeError:
                            return "Error: Malformed JSON from server during model pull."
                return pull_status
            else:
                return f"Error: Server returned {response.status_code} while pulling model. Response: {response.text}"
        except requests.RequestException as e:
            logging.error(f"Ollama model pull error: {str(e)}")
            return f"Error: {str(e)}"
