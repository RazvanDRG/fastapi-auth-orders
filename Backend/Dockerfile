FROM python:3.11  
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


#Docker isolates the runtime, dependencies, processes, filesystem, and networking of an application, while ports are only used to explicitly expose selected services outside the container.

#Dockerfile defines how an application image is built — including the runtime, dependencies, and the command used to start the application.
#I use it to ensure the application runs the same way in any environment.

#Dockerfile: how the application is built